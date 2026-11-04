import { type ReactNode, useEffect, useId } from "react";
import "./modal.css";

interface ModalProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  size?: "default" | "wide";
  onClose: () => void;
  children: ReactNode;
}

const Modal = ({
  title,
  eyebrow,
  subtitle,
  size = "default",
  onClose,
  children,
}: ModalProps) => {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`modal-dialog${size === "wide" ? " modal-dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <div>
            {eyebrow && <p className="modal-eyebrow">{eyebrow}</p>}
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {subtitle && <p className="modal-subtitle">{subtitle}</p>}

        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
