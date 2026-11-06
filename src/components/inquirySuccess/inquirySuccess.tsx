import { useEffect, useRef } from "react";
import "./inquirySuccess.css";

interface InquirySuccessProps {
  message: string;
  onDismiss: () => void;
}

// Replaces the inquiry form section after a successful submission. Dismissing
// it (the × button) brings the inquiry form back so another can be sent.
const InquirySuccess = ({ message, onDismiss }: InquirySuccessProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // The submit button that held focus is gone, so move focus here; this also
  // scrolls the panel into view inside the modal.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      className="inquiry-success"
      role="status"
      tabIndex={-1}
    >
      <button
        type="button"
        className="inquiry-success-dismiss"
        aria-label="Dismiss and send another inquiry"
        onClick={onDismiss}
      >
        ×
      </button>

      <span className="inquiry-success-icon" aria-hidden="true">
        ✓
      </span>
      <p className="inquiry-success-title">Inquiry sent</p>
      <p className="inquiry-success-message">{message}</p>
    </div>
  );
};

export default InquirySuccess;
