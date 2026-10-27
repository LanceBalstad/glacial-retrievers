import { type ChangeEvent, type FormEvent, useState } from "react";
import "./footer.css";
import FacebookIcon from "../icons/facebookIcon.tsx";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

export interface FooterContent {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
}

interface FooterProps {
  content: FooterContent;
}

type GeneralContactFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  question: string;
};

const initialGeneralContactForm: GeneralContactFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  question: "",
};

const Footer = ({ content }: FooterProps) => {
  const [isGeneralModalOpen, setIsGeneralModalOpen] = useState(false);
  const [formData, setFormData] = useState<GeneralContactFormState>(initialGeneralContactForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "general",
          event_status: "requested",
          start_date: new Date().toISOString().slice(0, 10),
          end_date: null,
          details: {
            owner_first_name: formData.firstName,
            owner_last_name: formData.lastName,
            owner_phone: formData.phone,
            owner_email: formData.email,
            question: formData.question,
            description: formData.question,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not submit your general inquiry.");
      }

      setStatus("success");
      setMessage("Thanks! Your question has been sent. We’ll be in touch soon.");
      setFormData(initialGeneralContactForm);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while sending your message.",
      );
    }
  };

  return (
    <>
      <footer className="site-footer">
        <div className="site-footer-copy">
          <p className="site-footer-eyebrow">{content.eyebrow}</p>
          <h2>{content.title}</h2>
          <p className="site-footer-description">{content.description}</p>
        </div>

        <div className="site-footer-action">
          <div className="site-footer-contact-list">
            <p className="site-footer-note">{content.note}</p>
            <p className="site-footer-contact">1877 230th Ave, Mahnomen, MN, United States, Minnesota</p>
            <p className="site-footer-contact">(218) 935-0931</p>
            <a
              href="https://www.facebook.com/glacialretrieverkennels/"
              target="_blank"
              rel="noreferrer"
              className="site-footer-facebook"
              aria-label="Facebook"
            >
              <FacebookIcon />
              {/* <span>Glacial Retriever Kennels | Mahnomen MN | Facebook</span> */}
            </a>
          </div>

          <button
            className="site-footer-button"
            type="button"
            onClick={() => {
              setStatus("idle");
              setMessage("");
              setFormData(initialGeneralContactForm);
              setIsGeneralModalOpen(true);
            }}
          >
            Contact Us
          </button>
        </div>
      </footer>

      {isGeneralModalOpen ? (
        <div
          className="site-footer-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsGeneralModalOpen(false);
            }
          }}
        >
          <div className="site-footer-modal" role="dialog" aria-modal="true" aria-label="General contact form">
            <div className="site-footer-modal-header">
              <div>
                <p className="site-footer-modal-eyebrow">Contact us</p>
                <h3>Ask a question</h3>
              </div>
              <button
                type="button"
                className="site-footer-modal-close"
                onClick={() => setIsGeneralModalOpen(false)}
                aria-label="Close contact form"
              >
                ×
              </button>
            </div>

            <form className="site-footer-modal-form" onSubmit={handleSubmit}>
              <div className="site-footer-field-row">
                <label>
                  First name
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="Your first name"
                    required
                  />
                </label>

                <label>
                  Last name
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Your last name"
                    required
                  />
                </label>
              </div>

              <div className="site-footer-field-row">
                <label>
                  Phone number
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(555) 123-4567"
                    required
                  />
                </label>

                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                  />
                </label>
              </div>

              <label>
                Question / description
                <textarea
                  name="question"
                  value={formData.question}
                  onChange={handleChange}
                  placeholder="Tell us what you’re looking for, what you’d like to know, or what kind of support you need."
                  rows={6}
                  required
                />
              </label>

              <button type="submit" className="site-footer-form-submit" disabled={status === "submitting"}>
                {status === "submitting" ? "Sending..." : "Send question"}
              </button>

              {message ? (
                <p className={`site-footer-form-status ${status}`} role="status">
                  {message}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default Footer;
