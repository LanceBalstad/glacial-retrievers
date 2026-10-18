import titleImage from "../../assets/titleImage.jpg";
import AvailableDogs from "../../components/availableDogs/availableDogs.tsx";
import PageHero from "../../components/pageHero/pageHero.tsx";
import "./allDogs.css";

const AllDogs = () => (
  <main className="all-dogs-page">
    <PageHero
      image={titleImage}
      imageAlt="Glacial Retrievers dogs outdoors"
      eyebrow="Glacial Retrievers"
      title="Meet the dogs"
      description="Find your next companion. Explore the dogs currently available and narrow the list by breed, sex, or age."
      linkText="View available dogs"
      linkHref="#available-dogs"
    />
    <div className="all-dogs-content" id="available-dogs">
      <AvailableDogs />
    </div>
  </main>
);

export default AllDogs;
