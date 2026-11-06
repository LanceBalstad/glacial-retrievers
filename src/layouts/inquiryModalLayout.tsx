import { type ReactNode } from "react";
import InquirySuccess from "../components/inquirySuccess/inquirySuccess.tsx";
import Modal from "../components/modal/modal.tsx";
import RequiredMark from "../components/requiredMark/requiredMark.tsx";
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_HREF } from "../lib/contact";
import "./inquiryModalLayout.css";

interface InquiryModalLayoutProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  size?: "default" | "wide";
  onClose: () => void;
  // When set, the inquiry section is replaced by a success panel until dismissed.
  successMessage?: string | null;
  onDismissSuccess: () => void;
  children: ReactNode;
}

// Shared frame for every public inquiry form. Calling is the preferred way to
// book, so the phone call-to-action leads and the form is presented as a
// secondary, non-binding inquiry.
const InquiryModalLayout = ({
  title,
  eyebrow,
  subtitle,
  size,
  onClose,
  successMessage,
  onDismissSuccess,
  children,
}: InquiryModalLayoutProps) => (
  <Modal
    title={title}
    eyebrow={eyebrow}
    subtitle={subtitle}
    size={size}
    onClose={onClose}
    closeOnBackdropClick={false}
  >
    <div className="inquiry-call">
      <p className="inquiry-call-label">Call to make an appointment</p>
      <a className="inquiry-call-number" href={BUSINESS_PHONE_HREF}>
        {BUSINESS_PHONE_DISPLAY}
      </a>
      <p className="inquiry-call-note">
        Calling is the fastest way to book and get your questions answered.
      </p>
    </div>

    {successMessage ? (
      <InquirySuccess message={successMessage} onDismiss={onDismissSuccess} />
    ) : (
      <>
        <div className="inquiry-divider">
          <span>or send an inquiry</span>
        </div>

        <p className="inquiry-disclaimer">
          Submitting this form is an <strong>inquiry only</strong>. It does not
          book or confirm an appointment. We’ll contact you to follow up.
        </p>

        <p className="inquiry-required-note">
          <RequiredMark /> Required field
        </p>

        {children}
      </>
    )}
  </Modal>
);

export default InquiryModalLayout;
