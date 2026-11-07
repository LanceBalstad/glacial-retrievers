import { useState } from "react";
import "./footer.css";
import ContactModal from "../contactModal/contactModal.tsx";
import FacebookIcon from "../icons/facebookIcon.tsx";
import { BUSINESS_ADDRESS, BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_HREF } from "../../lib/contact";

export interface FooterContent {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
}

interface FooterProps {
  content: FooterContent;
}

const Footer = ({ content }: FooterProps) => {
  const [isContactOpen, setIsContactOpen] = useState(false);

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
            <p className="site-footer-contact">{BUSINESS_ADDRESS}</p>
            <a className="site-footer-contact" href={BUSINESS_PHONE_HREF}>
              {BUSINESS_PHONE_DISPLAY}
            </a>
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
            onClick={() => setIsContactOpen(true)}
          >
            Contact Us
          </button>
        </div>
      </footer>

      {isContactOpen && <ContactModal onClose={() => setIsContactOpen(false)} />}
    </>
  );
};

export default Footer;
