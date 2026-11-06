import { type FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import SignaturePad from "signature_pad";
import RequiredMark from "../../components/requiredMark/requiredMark.tsx";
import "./signDocument.css";

/* Public page a customer opens from the link the admin sends. No login: the
 * token in the URL is the only key (see server/src/documents.ts). */

// A checkbox from the PDF; every one must be checked to sign.
interface ChecklistItem {
  name: string;
  label: string;
}

interface SigningInfo {
  document_name: string;
  recipient_name: string;
  status: "viewed" | "signed";
  signed_at: string | null;
  items: ChecklistItem[];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; info: SigningInfo };

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(
        new Date(value),
      )
    : "";

// Drawing pad sized to its box and the screen's pixel density; keeps the
// strokes when the box is resized (e.g. rotating a phone).
const useSignaturePad = (canvasRef: React.RefObject<HTMLCanvasElement | null>, enabled: boolean) => {
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;

    const pad = new SignaturePad(canvas, { penColor: "#1b2a4a", minWidth: 0.8, maxWidth: 2.6 });
    padRef.current = pad;
    const handleEnd = () => setIsEmpty(pad.isEmpty());
    pad.addEventListener("endStroke", handleEnd);

    const resize = () => {
      const data = pad.toData();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      pad.removeEventListener("endStroke", handleEnd);
      pad.off();
      padRef.current = null;
    };
  }, [canvasRef, enabled]);

  const clear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
  };

  return { padRef, isEmpty, clear };
};

const SignDocument = () => {
  const { token = "" } = useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [signerName, setSignerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isSigned = signedAt !== null || (state.kind === "ready" && state.info.status === "signed");
  const { padRef, isEmpty, clear } = useSignaturePad(canvasRef, state.kind === "ready" && !isSigned);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/sign/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (SigningInfo & { error?: string }) | null;
        if (!response.ok || !body) {
          setState({ kind: "error", message: body?.error ?? "This signing link isn’t valid." });
          return;
        }
        setState({ kind: "ready", info: body });
        setSignerName(body.recipient_name);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ kind: "error", message: "We couldn’t load this document. Please try again." });
        }
      });

    return () => controller.abort();
  }, [token]);

  const toggle = (name: string, isChecked: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (isChecked) next.add(name);
      else next.delete(name);
      return next;
    });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (state.kind === "ready" && state.info.items.some((item) => !checked.has(item.name))) {
      setFormError("Please check every box in the checklist.");
      return;
    }

    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setFormError("Please draw your signature in the box.");
      return;
    }
    if (!consent) {
      setFormError("Please check the box to agree to sign electronically.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/sign/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checked: [...checked],
          signer_name: signerName.trim(),
          signature_png: pad.toDataURL("image/png"),
          consent: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; signed_at?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "We couldn’t save your signature. Please try again.");
      }
      setSignedAt(body?.signed_at ?? new Date().toISOString());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <main className="sign-document">
        <div className="sd-card">
          <p className="sd-muted" role="status">
            Loading your document…
          </p>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="sign-document">
        <div className="sd-card">
          <h1>Document unavailable</h1>
          <p>{state.message}</p>
        </div>
      </main>
    );
  }

  const { info } = state;
  const copyUrl = `/api/sign/${encodeURIComponent(token)}/signed.pdf`;

  if (isSigned) {
    return (
      <main className="sign-document">
        <div className="sd-card sd-done" role="status">
          <span className="sd-done-icon" aria-hidden="true">
            ✓
          </span>
          <h1>Thank you, it’s signed</h1>
          <p>
            {info.document_name} was signed on {formatDate(signedAt ?? info.signed_at)}. We’ve received it, so
            there’s nothing else you need to send.
          </p>
          <a className="sd-button" href={copyUrl}>
            Download your signed copy
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="sign-document">
      <form className="sd-card" onSubmit={handleSubmit} noValidate={false}>
        <p className="sd-eyebrow">Glacial Retrievers · Document to sign</p>
        <h1>{info.document_name}</h1>
        <p>
          Hi {info.recipient_name}, please review the document, complete the checklist below, and sign at the
          bottom.
        </p>

        <a
          className="sd-view-link"
          href={`/api/sign/${encodeURIComponent(token)}/preview.pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View the full document (PDF)
        </a>

        {info.items.length > 0 && (
          <fieldset className="sd-section">
            <legend>Checklist</legend>
            <p className="sd-muted">Please read the document and check each item to confirm.</p>
            {info.items.map((item) => (
              <label key={item.name} className="sd-check">
                <input
                  type="checkbox"
                  checked={checked.has(item.name)}
                  onChange={(event) => toggle(item.name, event.target.checked)}
                  required
                />
                <span>
                  {item.label}
                  <RequiredMark />
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="sd-section">
          <legend>Sign</legend>

          <label className="sd-field">
            <span>
              Your full name
              <RequiredMark />
            </span>
            <input
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
              autoComplete="name"
              maxLength={200}
              required
            />
          </label>

          <div className="sd-field">
            <span id="sd-signature-label">
              Signature
              <RequiredMark />
            </span>
            <div className="sd-pad">
              <canvas
                ref={canvasRef}
                className="sd-canvas"
                role="img"
                aria-labelledby="sd-signature-label"
              />
              {isEmpty && (
                <span className="sd-pad-hint" aria-hidden="true">
                  Sign here with your finger or mouse
                </span>
              )}
            </div>
            <button type="button" className="sd-link-button" onClick={clear} disabled={isEmpty}>
              Clear signature
            </button>
          </div>

          <label className="sd-check sd-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              required
            />
            <span>
              I agree to sign this document electronically, and my electronic signature is the legal equivalent
              of my handwritten signature.
              <RequiredMark />
            </span>
          </label>
        </fieldset>

        {formError && (
          <p className="sd-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" className="sd-button" disabled={submitting}>
          {submitting ? "Signing…" : "Sign document"}
        </button>
      </form>
    </main>
  );
};

export default SignDocument;
