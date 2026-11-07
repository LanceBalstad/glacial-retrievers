import titleImage from "../../assets/titleImage.jpg";
import "./home.css";
import Card from "../../components/card/card.tsx";
import cardImage1 from "../../assets/cardImage1.jpg";
import cardImage2 from "../../assets/cardImage2.jpg";
import cardImage3 from "../../assets/cardImage3.jpg";
import cardImage4 from "../../assets/cardImage4.jpg";

const Home = () => {
  const images = [
    {
      image: cardImage1,
      alt: "Pointer",
      banner: "Training",
      slug: "training",
      message:
        "Gundog, obedience, and house training programs that build a steady, reliable partner in the field and at home.",
    },
    {
      image: cardImage2,
      alt: "Retriever",
      banner: "All Available Dogs",
      slug: "all-dogs",
      message:
        "Browse the dogs ready for new homes, and filter by breed, sex, or age to find the right fit.",
    },
    {
      image: cardImage3,
      alt: "Labrador",
      banner: "Dog Boarding",
      slug: "boarding",
      message:
        "A safe, comfortable place for your dog to stay while you're away, cared for by people who know dogs.",
    },
    {
      image: cardImage4,
      alt: "Puppy",
      banner: "Puppies",
      slug: "puppies",
      message:
        "Meet our available puppies and learn what to expect as you bring your new companion home.",
    },
  ];

  return (
    <>
      <div className="body">
        <div className="title-image">
          <img src={titleImage} alt="Three Labradors" />
        </div>
        <div className="about">
          <p>
            Glacial Retrievers is a gundog kennel built around training,
            breeding, and caring for dogs that are as steady in the field as
            they are at home. We offer gundog training and boarding, along with
            stud service, whelping services, and one-on-one consulting. Whether
            you're starting a new puppy, sharpening a seasoned hunting partner,
            or need a safe place for your dog while you're away, we're here to
            help your dog be its best.
          </p>
        </div>
        <div className="cards">
          {images.map((item) => (
            <Card
              key={item.slug}
              image={item.image}
              alt={item.alt}
              banner={item.banner}
              slug={item.slug}
              message={item.message}
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default Home;
