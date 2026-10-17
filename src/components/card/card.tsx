import { Link } from "react-router-dom";
import "./card.css";

interface CardProps {
  image: string;
  alt: string;
  banner: string;
  slug: string;
}

const Card = ({ image, alt, banner, slug }: CardProps) => {
  return (
    <div className="container">
      <img className="image" src={image} alt={alt} />

      {banner && <h1 className="banner">{banner}</h1>}

      <div className="message">
        <p>
          Learn more about {banner.toLowerCase()}, including breed information
          and care considerations.
        </p>
      </div>

      <Link to={`/${slug}`} className="learn-more">
        Learn More
      </Link>
    </div>
  );
};

export default Card;
