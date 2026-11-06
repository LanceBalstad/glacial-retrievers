import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../components/modal/modal.tsx";
import RequiredMark from "../../components/requiredMark/requiredMark.tsx";
import { adminFetch } from "../../lib/adminApi";
import { auth, isAllowedAdminEmail, subscribeToAuth } from "../../lib/firebase";
import "./adminDocuments.css";

/* ---------- Types (match server/src/documents.ts) ---------- */

// A document_types.name, e.g. "training" or "breeding".
type DocumentKind = string;
type RequestStatus = "sent" | "viewed" | "signed" | "voided";

interface DocumentType {
  id: number;
  name: DocumentKind;
}

// GET /api/admin/document-templates: the uploaded PDF for a document type.
interface DocumentTemplate {
  id: number;
  kind: DocumentKind;
  name: string;
  updated_at: string;
  checkbox_count: number;
  has_signature_box: boolean;
}

interface DocumentRequest {
  id: number;
  kind: DocumentKind;
  document_name: string;
  recipient_name: string;
  token: string;
  status: RequestStatus;
  signed_via: "link" | "upload" | null;
  signer_name: string | null;
  created_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  has_signed_pdf: boolean;
}

// Card text for known document types; any other type from the
// document_types table gets its name as the title.
const TYPE_COPY: Record<string, { title: string; description: string }> = {
  training: { title: "Training checklist", description: "Sent to customers before training starts." },
  breeding: { title: "Breeding checklist", description: "Sent to customers buying a dog." },
};

const typeCopy = (kind: DocumentKind) =>
  TYPE_COPY[kind] ?? {
    title: `${kind.charAt(0).toUpperCase()}${kind.slice(1).replace(/_/g, " ")}`,
    description: "Upload the PDF customers should sign.",
  };

const STATUS_LABELS: Record<RequestStatus, string> = {
  sent: "Sent",
  viewed: "Opened",
  signed: "Signed",
  voided: "Voided",
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
        new Date(value),
      )
    : "";

const signingUrl = (token: string) => `${window.location.origin}/sign/${token}`;

const readError = async (response: Response, fallback: string) => {
  const result = (await response.json().catch(() => null)) as { error?: string } | null;
  return result?.error ?? fallback;
};

// PDF routes need the admin token, so they're fetched as blobs.
const fetchPdfBlobUrl = async (url: string) => {
  const response = await adminFetch(url);
  if (!response.ok) {
    throw new Error(await readError(response, "Could not load the PDF."));
  }
  return URL.createObjectURL(await response.blob());
};

const downloadPdf = async (url: string, fileName: string) => {
  const objectUrl = await fetchPdfBlobUrl(url);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
};

// Opens the tab first (while still inside the click) so pop-up blockers allow it.
const viewPdf = async (url: string) => {
  const tab = window.open("", "_blank");
  try {
    const objectUrl = await fetchPdfBlobUrl(url);
    if (tab) {
      tab.location.href = objectUrl;
    } else {
      window.location.href = objectUrl;
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
};

const uploadPdf = async (url: string, file: File) => {
  if (file.type && file.type !== "application/pdf") {
    throw new Error("Please choose a PDF file.");
  }
  const response = await adminFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!response.ok) {
    throw new Error(await readError(response, "Could not upload the PDF."));
  }
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const COPY_FEEDBACK_MS = 2200;

interface CopyFeedback {
  key: string; // which button was clicked
  ok: boolean;
  nonce: number; // changes every click so animations restart
}

// Visible feedback on every copy click, including repeat clicks: the button
// briefly reads "Copied ✓" and a small toast fades in and out.
const useCopyFeedback = () => {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const copy = async (key: string, text: string) => {
    const ok = await copyText(text);
    window.clearTimeout(timerRef.current);
    setFeedback({ key, ok, nonce: Date.now() });
    timerRef.current = window.setTimeout(() => setFeedback(null), COPY_FEEDBACK_MS);
    return ok;
  };

  // Button content; the keyed span restarts its flash animation on each click.
  const label = (key: string) =>
    feedback?.key === key ? (
      <span key={feedback.nonce} className="ad-copy-label is-flash">
        {feedback.ok ? "Copied ✓" : "Copy failed"}
      </span>
    ) : (
      "Copy link"
    );

  // Always-present live region so screen readers announce each copy.
  const toast = (
    <div className="ad-copy-toast-region" role="status" aria-live="polite">
      {feedback && (
        <p key={feedback.nonce} className={`ad-copy-toast${feedback.ok ? "" : " is-error"}`}>
          {feedback.ok ? "Link copied to clipboard" : "Couldn’t copy. Select the link and copy it manually."}
        </p>
      )}
    </div>
  );

  return { copy, label, toast };
};

/* ---------- Document card ---------- */

interface DocumentCardProps {
  kind: DocumentKind;
  template: DocumentTemplate | undefined;
  // Unsigned links for this type; they stop working if the PDF is deleted.
  openLinkCount: number;
  onChanged: (message: string) => Promise<void>;
}

const DocumentCard = ({ kind, template, openLinkCount, onChanged }: DocumentCardProps) => {
  const { title, description } = typeCopy(kind);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    void run(async () => {
      await uploadPdf(`/api/admin/document-templates/${encodeURIComponent(kind)}/pdf`, file);
      await onChanged(template ? `${title} PDF replaced.` : `${title} PDF uploaded.`);
    });
  };

  const deletePdf = () =>
    run(async () => {
      if (!template) return;
      const response = await adminFetch(`/api/admin/document-templates/${template.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not delete the PDF."));
      }
      setConfirmingDelete(false);
      await onChanged(`${title} PDF deleted.`);
    });

  const summary = template
    ? [
        `${template.checkbox_count} ${template.checkbox_count === 1 ? "checkbox" : "checkboxes"}`,
        template.has_signature_box ? "signature box" : "signature added on a certificate page",
        `updated ${formatDate(template.updated_at)}`,
      ].join(" · ")
    : description;

  return (
    <article className="ad-template">
      <div className="ad-template-head">
        <div>
          <p className="ad-eyebrow">{title}</p>
          <h3>{template ? "PDF uploaded" : "No PDF uploaded yet"}</h3>
          <p className="ad-muted">{summary}</p>
        </div>

        {!confirmingDelete && (
          <div className="ad-template-actions">
            {template && (
              <>
                <button
                  type="button"
                  className="ad-button ad-button-ghost"
                  disabled={busy}
                  onClick={() => void run(() => viewPdf(`/api/admin/document-templates/${template.id}/pdf`))}
                >
                  View
                </button>
                <button
                  type="button"
                  className="ad-button ad-button-ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      downloadPdf(`/api/admin/document-templates/${template.id}/pdf`, `${title}.pdf`),
                    )
                  }
                >
                  Download
                </button>
              </>
            )}
            <button type="button" className="ad-button" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Working…" : template ? "Replace" : "Upload PDF"}
            </button>
            {template && (
              <button
                type="button"
                className="ad-button ad-button-ghost ad-button-danger-text"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete…
              </button>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleFile} />
      </div>

      {confirmingDelete && (
        <div className="ad-confirm" role="group" aria-label={`Delete ${title} PDF`}>
          <span>
            Delete the {title.toLowerCase()} PDF?
            {openLinkCount > 0 &&
              ` ${openLinkCount} unsigned ${openLinkCount === 1 ? "link" : "links"} can’t be signed until you upload a new one.`}{" "}
            Signed copies are kept.
          </span>
          <button type="button" className="ad-button ad-button-danger" disabled={busy} onClick={() => void deletePdf()}>
            Delete PDF
          </button>
          <button
            type="button"
            className="ad-button ad-button-ghost"
            disabled={busy}
            onClick={() => setConfirmingDelete(false)}
          >
            Back
          </button>
        </div>
      )}

      {error && <p className="ad-error">{error}</p>}
    </article>
  );
};

/* ---------- New signing link dialog ---------- */

interface NewRequestDialogProps {
  // Document types that have a PDF uploaded.
  options: Array<{ id: number; kind: DocumentKind }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}

const NewRequestDialog = ({ options, onClose, onCreated }: NewRequestDialogProps) => {
  const [documentTypeId, setDocumentTypeId] = useState<number>(options[0]?.id ?? 0);
  const [recipientName, setRecipientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const copyFeedback = useCopyFeedback();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await adminFetch("/api/admin/document-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_type_id: documentTypeId, recipient_name: recipientName.trim() }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not create the signing link."));
      }
      const created = (await response.json()) as { token: string };
      const link = signingUrl(created.token);
      setCreatedLink(link);
      await copyFeedback.copy("new-link", link);
      await onCreated();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the signing link.");
    } finally {
      setSaving(false);
    }
  };

  if (createdLink) {
    return (
      <Modal eyebrow="Signing link ready" title={`Send to ${recipientName.trim()}`} onClose={onClose}>
        <div className="ad-dialog">
          <p>
            Paste this link into an email or text to {recipientName.trim()}. They can open it on their phone or
            computer, check the boxes, and sign.
          </p>
          <div className="ad-link-box">
            <input
              readOnly
              value={createdLink}
              aria-label="Signing link"
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              className="ad-button ad-copy-button"
              onClick={() => void copyFeedback.copy("new-link", createdLink)}
            >
              {copyFeedback.label("new-link")}
            </button>
          </div>
          <div className="ad-row-actions">
            <button type="button" className="ad-button" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
        {copyFeedback.toast}
      </Modal>
    );
  }

  return (
    <Modal eyebrow="Documents" title="New signing link" onClose={onClose}>
      <form className="modal-form ad-dialog" onSubmit={handleSubmit}>
        <label>
          <span>
            Document
            <RequiredMark />
          </span>
          <select value={documentTypeId} onChange={(event) => setDocumentTypeId(Number(event.target.value))} required>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {typeCopy(option.kind).title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>
            Customer name
            <RequiredMark />
          </span>
          <input
            value={recipientName}
            maxLength={200}
            autoFocus
            onChange={(event) => setRecipientName(event.target.value)}
            required
          />
        </label>

        {error && <p className="ad-error">{error}</p>}

        <div className="ad-row-actions">
          <button type="button" className="ad-button ad-button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ad-button" disabled={saving}>
            {saving ? "Creating…" : "Create signing link"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

/* ---------- Page ---------- */

const AdminDocuments = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const copyFeedback = useCopyFeedback();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<DocumentRequest | null>(null);

  // Admin-only page: anyone else goes to the admin login.
  useEffect(() => {
    if (!auth) {
      navigate("/admin-login", { replace: true });
      return;
    }

    return subscribeToAuth((user) => {
      const allowed = Boolean(user && isAllowedAdminEmail(user.email));
      setIsAdmin(allowed);
      if (!allowed) {
        navigate("/admin-login", { replace: true });
      }
    });
  }, [navigate]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [typeResponse, templateResponse, requestResponse] = await Promise.all([
        adminFetch("/api/admin/document-types"),
        adminFetch("/api/admin/document-templates"),
        adminFetch("/api/admin/document-requests"),
      ]);

      for (const response of [typeResponse, templateResponse, requestResponse]) {
        if (!response.ok) {
          throw new Error(await readError(response, "Could not load documents."));
        }
      }

      setDocumentTypes((await typeResponse.json()) as DocumentType[]);
      setTemplates((await templateResponse.json()) as DocumentTemplate[]);
      setRequests((await requestResponse.json()) as DocumentRequest[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void load();
    }
  }, [isAdmin, load]);

  const afterChange = async (message: string) => {
    setNotice(message);
    await load();
  };

  const runAction = async (request: DocumentRequest, action: () => Promise<void>) => {
    setBusyId(request.id);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const voidRequest = (request: DocumentRequest) =>
    runAction(request, async () => {
      const response = await adminFetch(`/api/admin/document-requests/${request.id}/void`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not void the link."));
      }
      setConfirmVoidId(null);
      await afterChange(`${request.recipient_name}’s link was voided. It no longer works.`);
    });

  const deleteRequest = (request: DocumentRequest) =>
    runAction(request, async () => {
      const response = await adminFetch(`/api/admin/document-requests/${request.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not delete the link."));
      }
      setConfirmDeleteId(null);
      await afterChange(`${request.recipient_name}’s voided link was deleted.`);
    });

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = uploadTarget;
    setUploadTarget(null);
    if (!file || !target) return;

    await runAction(target, async () => {
      await uploadPdf(`/api/admin/document-requests/${target.id}/signed-pdf`, file);
      await afterChange(`Signed PDF saved for ${target.recipient_name}.`);
    });
  };

  if (!isAdmin) {
    return null;
  }

  const sendableTypes = documentTypes
    .filter((type) => templates.some((template) => template.kind === type.name))
    .map((type) => ({ id: type.id, kind: type.name }));

  return (
    <main className="admin-documents">
      <div className="ad-content">
        <header className="ad-page-head">
          <div>
            <p className="ad-eyebrow">Admin</p>
            <h1>Documents</h1>
            <p className="ad-muted">Upload each checklist PDF once, then send customers a link to check the boxes and sign.</p>
          </div>
          <button
            type="button"
            className="ad-button"
            disabled={sendableTypes.length === 0}
            title={sendableTypes.length === 0 ? "Upload a checklist PDF first" : undefined}
            onClick={() => {
              setNotice(null);
              setIsCreating(true);
            }}
          >
            New signing link
          </button>
        </header>

        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="ad-notice" role="status">
            {notice}
          </p>
        )}

        <section className="ad-section" aria-labelledby="ad-templates-title">
          <h2 id="ad-templates-title">Checklists</h2>
          <div className="ad-templates">
            {documentTypes.map((type) => (
              <DocumentCard
                key={type.id}
                kind={type.name}
                template={templates.find((template) => template.kind === type.name)}
                openLinkCount={
                  requests.filter(
                    (request) => request.kind === type.name && (request.status === "sent" || request.status === "viewed"),
                  ).length
                }
                onChanged={afterChange}
              />
            ))}
          </div>
        </section>

        <section className="ad-section" aria-labelledby="ad-requests-title">
          <h2 id="ad-requests-title">Signing links</h2>

          {loading ? (
            <p className="ad-empty">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="ad-empty">
              No signing links yet. Use <strong>New signing link</strong> to send a checklist to a customer.
            </p>
          ) : (
            <ul className="ad-requests">
              {requests.map((request) => {
                const isBusy = busyId === request.id;
                const isOpen = request.status === "sent" || request.status === "viewed";
                const canUpload = request.status !== "voided" && request.signed_via !== "link";

                return (
                  <li key={request.id} className="ad-request">
                    <div className="ad-request-main">
                      <div>
                        <h3>{request.recipient_name}</h3>
                        <p className="ad-muted">{typeCopy(request.kind).title}</p>
                      </div>
                      <span className={`ad-status ad-status-${request.status}`}>{STATUS_LABELS[request.status]}</span>
                    </div>

                    <p className="ad-request-dates ad-muted">
                      Created {formatDate(request.created_at)}
                      {request.viewed_at && ` · Opened ${formatDate(request.viewed_at)}`}
                      {request.signed_at &&
                        ` · Signed ${formatDate(request.signed_at)}${
                          request.signed_via === "upload" ? " (uploaded copy)" : ""
                        }`}
                    </p>

                    {confirmDeleteId === request.id ? (
                      <div className="ad-confirm" role="group" aria-label="Delete signing link">
                        <span>Delete {request.recipient_name}’s voided link? This removes it from the list for good.</span>
                        <button
                          type="button"
                          className="ad-button ad-button-danger"
                          disabled={isBusy}
                          onClick={() => void deleteRequest(request)}
                        >
                          Delete link
                        </button>
                        <button
                          type="button"
                          className="ad-button ad-button-ghost"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Back
                        </button>
                      </div>
                    ) : confirmVoidId === request.id ? (
                      <div className="ad-confirm" role="group" aria-label="Void signing link">
                        <span>Void this link? {request.recipient_name} won’t be able to sign with it.</span>
                        <button
                          type="button"
                          className="ad-button ad-button-danger"
                          disabled={isBusy}
                          onClick={() => void voidRequest(request)}
                        >
                          Void link
                        </button>
                        <button
                          type="button"
                          className="ad-button ad-button-ghost"
                          disabled={isBusy}
                          onClick={() => setConfirmVoidId(null)}
                        >
                          Back
                        </button>
                      </div>
                    ) : (
                      <div className="ad-request-actions">
                        {isOpen && (
                          <button
                            type="button"
                            className="ad-button ad-copy-button"
                            disabled={isBusy}
                            onClick={() =>
                              void copyFeedback.copy(`request-${request.id}`, signingUrl(request.token))
                            }
                          >
                            {copyFeedback.label(`request-${request.id}`)}
                          </button>
                        )}
                        {request.has_signed_pdf && (
                          <button
                            type="button"
                            className="ad-button"
                            disabled={isBusy}
                            onClick={() =>
                              void runAction(request, () =>
                                downloadPdf(
                                  `/api/admin/document-requests/${request.id}/pdf`,
                                  `${typeCopy(request.kind).title} - ${request.recipient_name} (signed).pdf`,
                                ),
                              )
                            }
                          >
                            Download signed PDF
                          </button>
                        )}
                        {canUpload && (
                          <button
                            type="button"
                            className="ad-button ad-button-ghost"
                            disabled={isBusy}
                            onClick={() => {
                              setUploadTarget(request);
                              uploadRef.current?.click();
                            }}
                          >
                            {request.signed_via === "upload" ? "Replace uploaded PDF" : "Upload signed PDF"}
                          </button>
                        )}
                        {isOpen && (
                          <button
                            type="button"
                            className="ad-button ad-button-ghost ad-button-danger-text"
                            disabled={isBusy}
                            onClick={() => setConfirmVoidId(request.id)}
                          >
                            Void…
                          </button>
                        )}
                        {request.status === "voided" && (
                          <button
                            type="button"
                            className="ad-button ad-button-ghost ad-button-danger-text"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(request.id)}
                          >
                            Delete…
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <input ref={uploadRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleUploadFile} />
        </section>
      </div>

      {copyFeedback.toast}

      {isCreating && (
        <NewRequestDialog options={sendableTypes} onClose={() => setIsCreating(false)} onCreated={load} />
      )}
    </main>
  );
};

export default AdminDocuments;
