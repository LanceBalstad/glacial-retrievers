import { createHash, randomBytes } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import type { Pool } from "pg";
import {
  PDFCheckBox,
  PDFDocument,
  type PDFField,
  type PDFFont,
  PDFHexString,
  type PDFImage,
  PDFName,
  type PDFPage,
  PDFSignature,
  PDFString,
  PDFTextField,
  rgb,
  StandardFonts,
} from "pdf-lib";

/*
 * Admin Documents. Each document type (document_types: training, breeding)
 * has one PDF: a few paragraphs, checkboxes, a signature box and a date field.
 * The admin creates a signing link for a customer; the customer checks every
 * box, signs, and a signed, flattened PDF with a certificate page is stored.
 * Tables: server/sql/create_documents_tables.sql.
 *
 * /api/admin/* routes are protected by requireAdmin in index.ts. /api/sign/*
 * routes are public: the random token in the link is the only key.
 */

// A document_types.name, e.g. "training" or "breeding".
export type DocumentKind = string;
// document_request_status.name and document_signed_via.name values.
type RequestStatus = "sent" | "viewed" | "signed" | "voided";
type SignedVia = "link" | "upload";

export interface ChecklistItem {
  name: string; // PDF checkbox field name
  label: string; // text shown to the customer
}

export interface Checklist {
  items: ChecklistItem[];
  hasSignatureBox: boolean;
}

interface SignatureStamp {
  png: Uint8Array;
  signerName: string;
  signedAt: Date;
  ip: string;
  userAgent: string;
  requestId: number;
  documentName: string;
  templateSha256: string;
  itemCount: number;
}

// Starting names for new templates; any other document type gets its name capitalized.
const DEFAULT_NAMES: Record<string, string> = {
  training: "Training checklist",
  breeding: "Breeding checklist (dog purchase)",
};
const defaultTemplateName = (kind: DocumentKind) =>
  DEFAULT_NAMES[kind] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1).replace(/_/g, " ")}`;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 500 * 1024;

// Text fields filled automatically: the signing date and, if present, a printed name.
const DATE_FIELD = /^\s*((signature|signed)\s*_?)?date(\s*_?signed)?\s*$/i;
const NAME_FIELD = /^\s*(print(ed)?|full)\s*_?name\s*$/i;
// Default names PDF editors give checkboxes ("Check Box1", "CheckBox 3", "Checkbox").
const GENERIC_CHECKBOX_NAME = /^(check\s*_?box|checkbox|cb)\s*_?\d*$/i;

// Lookup-table ids by name, inlined into queries. Only the typed constants
// above are ever interpolated, never user input.
const statusId = (status: RequestStatus) =>
  `(SELECT id FROM public.document_request_status WHERE name = '${status}')`;
const signedViaId = (via: SignedVia) =>
  `(SELECT id FROM public.document_signed_via WHERE name = '${via}')`;

const pdfUpload = express.raw({ type: "application/pdf", limit: MAX_PDF_BYTES });

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Standard PDF fonts only cover WinAnsi; swap common Unicode punctuation and
// drop anything else so drawing text never throws.
const toPdfText = (value: string) =>
  value
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

const formatSignedDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);

const fileName = (name: string, suffix: string) =>
  `${name.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "document"}${suffix}.pdf`;

const sendPdf = (res: Response, bytes: Uint8Array, name: string, disposition: "inline" | "attachment") => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${name}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(Buffer.from(bytes));
};

const loadPdf = async (bytes: Uint8Array) => {
  try {
    return await PDFDocument.load(bytes);
  } catch {
    throw new Error("This file couldn’t be read as a PDF. It may be password-protected or damaged.");
  }
};

/* ---------- Reading the checklist from the PDF ---------- */

type Widget = ReturnType<PDFSignature["acroField"]["getWidgets"]>[number];

const findWidgetPage = (doc: PDFDocument, widget: Widget) => {
  const pageRef = widget.P();
  const pages = doc.getPages();
  if (pageRef) {
    const page = pages.find((candidate) => candidate.ref === pageRef);
    if (page) return page;
  }
  const widgetRef = doc.context.getObjectRef(widget.dict);
  return pages.find((candidate) =>
    candidate.node.Annots()?.asArray().some((annot) => widgetRef && annot === widgetRef),
  );
};

// The field's tooltip (/TU) if it has one, otherwise its name.
const fieldDescription = (field: PDFField) => {
  const tooltip = field.acroField.dict.lookup(PDFName.of("TU"));
  const text =
    tooltip instanceof PDFString || tooltip instanceof PDFHexString ? tooltip.decodeText().trim() : "";
  return text || field.getName();
};

// Checkboxes in reading order (page, then top to bottom, then left to right).
// Generically named boxes ("Check Box1") become "Item 1", "Item 2", … so the
// customer can match them to the document.
export const readChecklist = async (bytes: Uint8Array): Promise<Checklist> => {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const fields = doc.getForm().getFields();

  const boxes = fields
    .filter((field): field is PDFCheckBox => field instanceof PDFCheckBox)
    .map((field) => {
      const widget = field.acroField.getWidgets()[0];
      const page = widget ? findWidgetPage(doc, widget) : undefined;
      const rect = widget?.getRectangle();
      return {
        field,
        pageIndex: page ? pages.indexOf(page) : Number.MAX_SAFE_INTEGER,
        top: rect ? rect.y + rect.height : 0,
        left: rect?.x ?? 0,
      };
    })
    .sort((a, b) => a.pageIndex - b.pageIndex || b.top - a.top || a.left - b.left);

  return {
    items: boxes.map(({ field }, index) => {
      const description = fieldDescription(field);
      return {
        name: field.getName(),
        label: GENERIC_CHECKBOX_NAME.test(description) ? `Item ${index + 1}` : description,
      };
    }),
    hasSignatureBox: fields.some((field) => field instanceof PDFSignature),
  };
};

/* ---------- Building the signed PDF ---------- */

// form.removeField needs each widget's appearance stream, which unsigned
// signature boxes often don't have. Fall back to unlinking the widgets from
// their pages and the field from the form directly.
const removeFieldSafely = (doc: PDFDocument, field: PDFSignature) => {
  const form = doc.getForm();
  try {
    form.removeField(field);
    return;
  } catch {
    // fall through
  }

  for (const widget of field.acroField.getWidgets()) {
    const page = findWidgetPage(doc, widget);
    const widgetRef = doc.context.getObjectRef(widget.dict);
    if (page && widgetRef) page.node.removeAnnot(widgetRef);
  }
  for (const page of doc.getPages()) page.node.removeAnnot(field.ref);
  form.acroForm.removeField(field.acroField);
};

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number) => {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
};

const drawCertificatePage = async (doc: PDFDocument, stamp: SignatureStamp, signatureImage: PDFImage) => {
  const page: PDFPage = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.13);
  const muted = rgb(0.4, 0.4, 0.4);
  const left = 56;
  const width = 612 - left * 2;
  let y = 736;

  page.drawText("Electronic Signature Certificate", { x: left, y, size: 18, font: bold, color: ink });
  y -= 22;
  page.drawText(toPdfText(stamp.documentName), { x: left, y, size: 12, font, color: muted });
  y -= 34;

  const rows: Array<[string, string]> = [
    ["Signed by", stamp.signerName],
    [
      "Signed at",
      new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "long" }).format(stamp.signedAt) +
        ` (${stamp.signedAt.toISOString()})`,
    ],
    ["Checklist", stamp.itemCount === 0 ? "No checkboxes" : `All ${stamp.itemCount} items confirmed`],
    ["IP address", stamp.ip || "Unknown"],
    ["Device / browser", stamp.userAgent || "Unknown"],
    ["Request ID", String(stamp.requestId)],
    ["Original document SHA-256", stamp.templateSha256],
  ];

  for (const [label, value] of rows) {
    page.drawText(label, { x: left, y, size: 9, font: bold, color: muted });
    y -= 13;
    for (const line of wrapText(toPdfText(value), font, 10.5, width)) {
      page.drawText(line, { x: left, y, size: 10.5, font, color: ink });
      y -= 14;
    }
    y -= 8;
  }

  y -= 6;
  page.drawText("Signature", { x: left, y, size: 9, font: bold, color: muted });
  const scaled = signatureImage.scaleToFit(260, 90);
  y -= scaled.height + 8;
  page.drawImage(signatureImage, { x: left, y, width: scaled.width, height: scaled.height });
  page.drawLine({ start: { x: left, y: y - 4 }, end: { x: left + 280, y: y - 4 }, thickness: 0.75, color: muted });
  y -= 30;

  const statement =
    `${stamp.signerName} agreed to sign this document electronically and confirmed that their ` +
    "electronic signature is the legal equivalent of their handwritten signature. The pages before " +
    "this certificate are the document as it was signed.";
  for (const line of wrapText(toPdfText(statement), font, 9.5, width)) {
    page.drawText(line, { x: left, y, size: 9.5, font, color: muted });
    y -= 13;
  }
};

// Checks every checkbox, fills the date (and printed name) fields, stamps the
// signature into the signature box, flattens the form, and appends the
// certificate page.
export const buildSignedPdf = async (templateBytes: Uint8Array, stamp: SignatureStamp) => {
  const doc = await loadPdf(templateBytes);
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const signatureImage = await doc.embedPng(stamp.png);

  for (const field of form.getFields()) {
    try {
      if (field instanceof PDFCheckBox) {
        field.check();
      } else if (field instanceof PDFTextField && DATE_FIELD.test(field.getName())) {
        field.setText(formatSignedDate(stamp.signedAt));
      } else if (field instanceof PDFTextField && NAME_FIELD.test(field.getName())) {
        field.setText(toPdfText(stamp.signerName));
      }
    } catch (error) {
      console.warn(`Could not fill PDF field "${field.getName()}":`, error);
    }
  }

  // Signature boxes have no value; draw the image over each one, then remove
  // the field so flattening doesn't trip on it.
  for (const field of form.getFields()) {
    if (!(field instanceof PDFSignature)) continue;
    for (const widget of field.acroField.getWidgets()) {
      const page = findWidgetPage(doc, widget);
      if (!page) continue;
      const rect = widget.getRectangle();
      const scaled = signatureImage.scaleToFit(rect.width, rect.height);
      page.drawImage(signatureImage, {
        x: rect.x + (rect.width - scaled.width) / 2,
        y: rect.y + (rect.height - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
      });
    }
    removeFieldSafely(doc, field);
  }

  try {
    form.updateFieldAppearances(font);
    form.flatten();
  } catch (error) {
    console.warn("Could not flatten PDF form; marking fields read-only instead:", error);
    for (const field of form.getFields()) field.enableReadOnly();
  }

  await drawCertificatePage(doc, stamp, signatureImage);
  return doc.save();
};

/* ---------- Routes ---------- */

interface TemplateRow {
  id: number;
  kind: DocumentKind;
  name: string;
  pdf: Buffer;
  updated_at: string;
}

interface SigningRow {
  id: number;
  status: RequestStatus;
  recipient_name: string;
  signed_at: string | null;
  kind: DocumentKind;
  // Null when the PDF for this type has been deleted and not replaced.
  template_name: string | null;
  pdf: Buffer | null;
}

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const requestBody = (req: Request) =>
  req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

const uploadedPdf = (req: Request) => {
  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new Error("Please upload a PDF file.");
  }
  if (body.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("That file isn’t a PDF.");
  }
  return new Uint8Array(body);
};

// Request IP for the certificate. Behind a proxy, set app.set("trust proxy", …).
const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "";

export const registerDocumentRoutes = (app: Express, pool: Pool) => {
  const sendError = (res: Response, status: number, error: string) => res.status(status).json({ error });

  const loadSigning = async (token: string) => {
    if (!TOKEN_PATTERN.test(token)) return undefined;
    const result = await pool.query<SigningRow>(
      `SELECT r.id, rs.name AS status, r.recipient_name, r.signed_at, dt.name AS kind,
              t.name AS template_name, t.pdf
       FROM public.document_requests r
       JOIN public.document_request_status rs ON rs.id = r.status_id
       JOIN public.document_types dt ON dt.id = r.document_type_id
       LEFT JOIN public.document_templates t ON t.document_type_id = r.document_type_id
       WHERE r.token = $1`,
      [token],
    );
    return result.rows[0];
  };

  const documentName = (signing: SigningRow) => signing.template_name ?? defaultTemplateName(signing.kind);

  /* ----- Admin: document types and their PDFs ----- */

  app.get("/api/admin/document-types", async (_req, res) => {
    try {
      const result = await pool.query<{ id: number; name: string }>(
        "SELECT id, name FROM public.document_types ORDER BY id",
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Failed to load document types:", error);
      sendError(res, 500, "Could not load document types.");
    }
  });

  // Each uploaded PDF with a short summary of what the customer will check.
  app.get("/api/admin/document-templates", async (_req, res) => {
    try {
      const result = await pool.query<TemplateRow>(
        `SELECT t.id, dt.name AS kind, t.name, t.pdf, t.updated_at
         FROM public.document_templates t
         JOIN public.document_types dt ON dt.id = t.document_type_id
         ORDER BY dt.id`,
      );
      const templates = await Promise.all(
        result.rows.map(async ({ pdf, ...template }) => {
          const checklist = await readChecklist(new Uint8Array(pdf)).catch(() => null);
          return {
            ...template,
            checkbox_count: checklist?.items.length ?? 0,
            has_signature_box: checklist?.hasSignatureBox ?? false,
          };
        }),
      );
      res.json(templates);
    } catch (error) {
      console.error("Failed to load document templates:", error);
      sendError(res, 500, "Could not load documents.");
    }
  });

  // Upload or replace the PDF for a document type. Unsigned links for this
  // type are signed with the new PDF from now on.
  app.put("/api/admin/document-templates/:kind/pdf", pdfUpload, async (req, res) => {
    const kind = String(req.params.kind);

    try {
      const type = await pool.query<{ id: number }>(
        "SELECT id FROM public.document_types WHERE name = $1",
        [kind],
      );
      const documentTypeId = type.rows[0]?.id;
      if (documentTypeId === undefined) {
        sendError(res, 400, "Unknown document type.");
        return;
      }

      const pdf = uploadedPdf(req);
      await readChecklist(pdf); // rejects unreadable / encrypted PDFs

      await pool.query(
        `INSERT INTO public.document_templates (document_type_id, name, pdf)
         VALUES ($1, $2, $3)
         ON CONFLICT (document_type_id) DO UPDATE SET pdf = EXCLUDED.pdf, updated_at = NOW()`,
        [documentTypeId, defaultTemplateName(kind), Buffer.from(pdf)],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save document PDF:", error);
      sendError(res, 400, error instanceof Error ? error.message : "Could not save the PDF.");
    }
  });

  app.get("/api/admin/document-templates/:id/pdf", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 400, "Document id is invalid.");
      return;
    }
    try {
      const result = await pool.query<{ name: string; pdf: Buffer }>(
        "SELECT name, pdf FROM public.document_templates WHERE id = $1",
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        sendError(res, 404, "Document not found.");
        return;
      }
      sendPdf(res, row.pdf, fileName(row.name, ""), "inline");
    } catch (error) {
      console.error("Failed to load document PDF:", error);
      sendError(res, 500, "Could not load the PDF.");
    }
  });

  // Signed requests keep their own signed PDF; unsigned links for this type
  // can't be signed until a new PDF is uploaded.
  app.delete("/api/admin/document-templates/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 400, "Document id is invalid.");
      return;
    }
    try {
      const result = await pool.query("DELETE FROM public.document_templates WHERE id = $1", [id]);
      if (result.rowCount === 0) {
        sendError(res, 404, "Document not found.");
        return;
      }
      res.json({ success: true, id });
    } catch (error) {
      console.error("Failed to delete document PDF:", error);
      sendError(res, 500, "Could not delete the PDF.");
    }
  });

  /* ----- Admin: signing requests ----- */

  app.get("/api/admin/document-requests", async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.id, dt.name AS kind, COALESCE(t.name, dt.name) AS document_name,
                r.recipient_name, r.token, rs.name AS status, sv.name AS signed_via, r.signer_name,
                r.created_at, r.viewed_at, r.signed_at, (r.signed_pdf IS NOT NULL) AS has_signed_pdf
         FROM public.document_requests r
         JOIN public.document_types dt ON dt.id = r.document_type_id
         JOIN public.document_request_status rs ON rs.id = r.status_id
         LEFT JOIN public.document_signed_via sv ON sv.id = r.signed_via_id
         LEFT JOIN public.document_templates t ON t.document_type_id = r.document_type_id
         ORDER BY r.created_at DESC, r.id DESC`,
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Failed to load document requests:", error);
      sendError(res, 500, "Could not load signing links.");
    }
  });

  // Only the document type and customer name are needed.
  app.post("/api/admin/document-requests", async (req, res) => {
    try {
      const body = requestBody(req);
      const documentTypeId = parseId(body.document_type_id);
      const recipientName = typeof body.recipient_name === "string" ? body.recipient_name.trim().slice(0, 200) : "";

      if (documentTypeId === null) {
        sendError(res, 400, "Please choose a document.");
        return;
      }
      if (!recipientName) {
        sendError(res, 400, "Please enter the customer’s name.");
        return;
      }

      const template = await pool.query(
        "SELECT 1 FROM public.document_templates WHERE document_type_id = $1",
        [documentTypeId],
      );
      if (template.rowCount === 0) {
        sendError(res, 400, "Upload a PDF for that document before sending it.");
        return;
      }

      const token = randomBytes(32).toString("base64url");
      const result = await pool.query(
        `INSERT INTO public.document_requests (document_type_id, recipient_name, token, status_id)
         VALUES ($1, $2, $3, ${statusId("sent")})
         RETURNING id, token, created_at`,
        [documentTypeId, recipientName, token],
      );
      res.status(201).json({ ...result.rows[0], status: "sent" });
    } catch (error) {
      console.error("Failed to create document request:", error);
      sendError(res, 500, "Could not create the signing link.");
    }
  });

  app.post("/api/admin/document-requests/:id/void", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 400, "Request id is invalid.");
      return;
    }
    try {
      const result = await pool.query(
        `UPDATE public.document_requests SET status_id = ${statusId("voided")}
         WHERE id = $1 AND status_id IN (${statusId("sent")}, ${statusId("viewed")}) RETURNING id`,
        [id],
      );
      if (result.rowCount === 0) {
        sendError(res, 409, "Only unsigned links can be voided.");
        return;
      }
      res.json({ success: true, id });
    } catch (error) {
      console.error("Failed to void document request:", error);
      sendError(res, 500, "Could not void the link.");
    }
  });

  // Only voided links can be deleted; signed records are kept.
  app.delete("/api/admin/document-requests/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 400, "Request id is invalid.");
      return;
    }
    try {
      const result = await pool.query(
        `DELETE FROM public.document_requests
         WHERE id = $1 AND status_id = ${statusId("voided")} RETURNING id`,
        [id],
      );
      if (result.rowCount === 0) {
        sendError(res, 409, "Only voided links can be deleted.");
        return;
      }
      res.json({ success: true, id });
    } catch (error) {
      console.error("Failed to delete document request:", error);
      sendError(res, 500, "Could not delete the link.");
    }
  });

  // Upload fallback: a PDF the customer signed outside the app (email, paper scan).
  app.put("/api/admin/document-requests/:id/signed-pdf", pdfUpload, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 400, "Request id is invalid.");
      return;
    }
    try {
      const pdf = uploadedPdf(req);
      const result = await pool.query(
        `UPDATE public.document_requests
         SET status_id = ${statusId("signed")}, signed_via_id = ${signedViaId("upload")},
             signed_pdf = $1, signed_pdf_sha256 = $2, signed_at = COALESCE(signed_at, NOW())
         WHERE id = $3 AND status_id <> ${statusId("voided")}
           AND (signed_via_id IS NULL OR signed_via_id = ${signedViaId("upload")})
         RETURNING id`,
        [Buffer.from(pdf), sha256(pdf), id],
      );
      if (result.rowCount === 0) {
        sendError(res, 409, "This link was voided or already signed online.");
        return;
      }
      res.json({ success: true, id });
    } catch (error) {
      console.error("Failed to upload signed PDF:", error);
      sendError(res, 400, error instanceof Error ? error.message : "Could not upload the PDF.");
    }
  });

  app.get("/api/admin/document-requests/:id/pdf", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 400, "Request id is invalid.");
      return;
    }
    try {
      const result = await pool.query<{ signed_pdf: Buffer | null; recipient_name: string; name: string }>(
        `SELECT r.signed_pdf, r.recipient_name, COALESCE(t.name, dt.name) AS name
         FROM public.document_requests r
         JOIN public.document_types dt ON dt.id = r.document_type_id
         LEFT JOIN public.document_templates t ON t.document_type_id = r.document_type_id
         WHERE r.id = $1`,
        [id],
      );
      const row = result.rows[0];
      if (!row?.signed_pdf) {
        sendError(res, 404, "No signed PDF for this link yet.");
        return;
      }
      sendPdf(res, row.signed_pdf, fileName(`${row.name} ${row.recipient_name}`, "-signed"), "attachment");
    } catch (error) {
      console.error("Failed to load signed PDF:", error);
      sendError(res, 500, "Could not load the signed PDF.");
    }
  });

  /* ----- Public: signing ----- */

  const UNAVAILABLE = "This document isn’t available right now. Please contact us.";

  app.get("/api/sign/:token", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const signing = await loadSigning(String(req.params.token));
      if (!signing) {
        sendError(res, 404, "This signing link isn’t valid.");
        return;
      }
      if (signing.status === "voided") {
        sendError(res, 410, "This signing link has been canceled. Please contact us for a new one.");
        return;
      }
      if (signing.status !== "signed" && !signing.pdf) {
        sendError(res, 409, UNAVAILABLE);
        return;
      }
      if (signing.status === "sent") {
        await pool.query(
          `UPDATE public.document_requests SET status_id = ${statusId("viewed")}, viewed_at = NOW()
           WHERE id = $1 AND status_id = ${statusId("sent")}`,
          [signing.id],
        );
      }

      const checklist =
        signing.status === "signed" || !signing.pdf ? null : await readChecklist(new Uint8Array(signing.pdf));
      res.json({
        document_name: documentName(signing),
        recipient_name: signing.recipient_name,
        status: signing.status === "sent" ? "viewed" : signing.status,
        signed_at: signing.signed_at,
        items: checklist?.items ?? [],
      });
    } catch (error) {
      console.error("Failed to load signing request:", error);
      sendError(res, 500, "Could not load this document.");
    }
  });

  // The PDF as-is, for "View the full document".
  app.get("/api/sign/:token/preview.pdf", async (req, res) => {
    try {
      const signing = await loadSigning(String(req.params.token));
      if (!signing || signing.status === "voided" || !signing.pdf) {
        sendError(res, signing ? 410 : 404, "This document isn’t available.");
        return;
      }
      sendPdf(res, signing.pdf, fileName(documentName(signing), ""), "inline");
    } catch (error) {
      console.error("Failed to load document preview:", error);
      sendError(res, 500, "Could not open the document.");
    }
  });

  // Body: { checked: string[] (checkbox field names), signer_name, signature_png, consent: true }
  app.post("/api/sign/:token", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const signing = await loadSigning(String(req.params.token));
      if (!signing) {
        sendError(res, 404, "This signing link isn’t valid.");
        return;
      }
      if (signing.status === "voided") {
        sendError(res, 410, "This signing link has been canceled. Please contact us for a new one.");
        return;
      }
      if (signing.status === "signed") {
        sendError(res, 409, "This document has already been signed.");
        return;
      }
      if (!signing.pdf) {
        sendError(res, 409, UNAVAILABLE);
        return;
      }

      const body = requestBody(req);
      const signerName = typeof body.signer_name === "string" ? body.signer_name.trim().slice(0, 200) : "";
      if (body.consent !== true) {
        sendError(res, 400, "Please agree to sign electronically.");
        return;
      }
      if (!signerName) {
        sendError(res, 400, "Please type your full name.");
        return;
      }

      const dataUrl = typeof body.signature_png === "string" ? body.signature_png : "";
      const base64 = dataUrl.startsWith("data:image/png;base64,") ? dataUrl.slice("data:image/png;base64,".length) : "";
      const png = Buffer.from(base64, "base64");
      if (png.length === 0 || png.subarray(1, 4).toString("latin1") !== "PNG") {
        sendError(res, 400, "Please draw your signature.");
        return;
      }
      if (png.length > MAX_SIGNATURE_BYTES) {
        sendError(res, 400, "That signature image is too large. Please clear it and sign again.");
        return;
      }

      // Every checkbox in the PDF must be confirmed.
      const templatePdf = new Uint8Array(signing.pdf);
      const { items } = await readChecklist(templatePdf);
      const checked = new Set(Array.isArray(body.checked) ? body.checked.filter((name) => typeof name === "string") : []);
      const missing = items.filter((item) => !checked.has(item.name));
      if (missing.length > 0) {
        sendError(res, 400, `Please check every box. Still unchecked: ${missing.map((item) => item.label).join(", ")}.`);
        return;
      }

      const signedAt = new Date();
      const ip = clientIp(req).slice(0, 100);
      const userAgent = String(req.get("user-agent") ?? "").slice(0, 500);
      const pdf = await buildSignedPdf(templatePdf, {
        png: new Uint8Array(png),
        signerName,
        signedAt,
        ip,
        userAgent,
        requestId: signing.id,
        documentName: documentName(signing),
        templateSha256: sha256(templatePdf),
        itemCount: items.length,
      });

      // Conditional update so a double submit can't sign twice.
      const result = await pool.query(
        `UPDATE public.document_requests
         SET status_id = ${statusId("signed")}, signed_via_id = ${signedViaId("link")},
             answers = $1::jsonb, signer_name = $2, signer_ip = $3, signer_user_agent = $4,
             signed_pdf = $5, signed_pdf_sha256 = $6, signed_at = $7
         WHERE id = $8 AND status_id IN (${statusId("sent")}, ${statusId("viewed")})
         RETURNING id`,
        [
          JSON.stringify(Object.fromEntries(items.map((item) => [item.name, item.label]))),
          signerName,
          ip,
          userAgent,
          Buffer.from(pdf),
          sha256(pdf),
          signedAt,
          signing.id,
        ],
      );
      if (result.rowCount === 0) {
        sendError(res, 409, "This document has already been signed.");
        return;
      }

      res.json({ success: true, signed_at: signedAt.toISOString() });
    } catch (error) {
      console.error("Failed to sign document:", error);
      sendError(res, 500, "Could not save your signature. Please try again.");
    }
  });

  // The customer's own copy after signing.
  app.get("/api/sign/:token/signed.pdf", async (req, res) => {
    try {
      const token = String(req.params.token);
      if (!TOKEN_PATTERN.test(token)) {
        sendError(res, 404, "This document isn’t available.");
        return;
      }
      const result = await pool.query<{ signed_pdf: Buffer | null; name: string }>(
        `SELECT r.signed_pdf, COALESCE(t.name, dt.name) AS name
         FROM public.document_requests r
         JOIN public.document_types dt ON dt.id = r.document_type_id
         LEFT JOIN public.document_templates t ON t.document_type_id = r.document_type_id
         WHERE r.token = $1 AND r.status_id = ${statusId("signed")}`,
        [token],
      );
      const row = result.rows[0];
      if (!row?.signed_pdf) {
        sendError(res, 404, "This document isn’t available.");
        return;
      }
      sendPdf(res, row.signed_pdf, fileName(row.name, "-signed"), "attachment");
    } catch (error) {
      console.error("Failed to load signed copy:", error);
      sendError(res, 500, "Could not load your signed copy.");
    }
  });
};
