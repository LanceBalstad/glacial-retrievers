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
    },
    {
      image: cardImage2,
      alt: "Retriever",
      banner: "All Available Dogs",
      slug: "all-dogs",
    },
    {
      image: cardImage3,
      alt: "Labrador",
      banner: "Dog Boarding",
      slug: "boarding",
    },
    {
      image: cardImage4,
      alt: "Puppy",
      banner: "Puppies",
      slug: "puppies",
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
            Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque
            faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi
            pretium tellus duis convallis. Tempus leo eu aenean sed diam urna
            tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas.
            Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut
            hendrerit semper vel class aptent taciti sociosqu. Ad litora
            torquent per conubia nostra inceptos himenaeos. Lorem ipsum dolor
            sit amet consectetur adipiscing elit.
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
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default Home;
