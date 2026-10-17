import "./pageHero.css";

interface PageHeroProps {
  image: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  description: string;
  linkText: string;
  linkHref: string;
}

const PageHero = ({
  image,
  imageAlt,
  eyebrow,
  title,
  description,
  linkText,
  linkHref,
}: PageHeroProps) => (
  <section className="content-hero">
    <img className="content-hero-image" src={image} alt={imageAlt} />
    <div className="content-hero-shade" />
    <div className="content-hero-copy">
      <p className="content-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="content-hero-description">{description}</p>
      <a className="content-hero-link" href={linkHref}>
        {linkText}
      </a>
    </div>
  </section>
);

export default PageHero;
