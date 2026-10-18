import "./footer.css";

export interface FooterContent {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
}

interface FooterProps {
  content: FooterContent;
}

const Footer = ({ content }: FooterProps) => (
  <footer className="site-footer">
    <div className="site-footer-copy">
      <p className="site-footer-eyebrow">{content.eyebrow}</p>
      <h2>{content.title}</h2>
      <p className="site-footer-description">{content.description}</p>
    </div>
    <div className="site-footer-action">
      <p className="site-footer-note">{content.note}</p>
      <button className="site-footer-button" type="button">
        Contact Us
      </button>
    </div>
  </footer>
);

export default Footer;
