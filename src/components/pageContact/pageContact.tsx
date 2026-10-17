import "./pageContact.css";

interface PageContactProps {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
}

const PageContact = ({
  eyebrow,
  title,
  description,
  note,
}: PageContactProps) => (
  <section className="content-contact">
    <div>
      <p className="content-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="content-contact-description">{description}</p>
    </div>
    <p className="content-contact-note">{note}</p>
  </section>
);

export default PageContact;
