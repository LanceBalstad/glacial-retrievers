import boardingImage from "../../assets/boadingImage.jpg";
import PageFaq, {
  type PageQuestion,
} from "../../components/pageFaq/pageFaq.tsx";
import PageHero from "../../components/pageHero/pageHero.tsx";
import "./boarding.css";

const boardingQuestions: PageQuestion[] = [
  {
    question: "Where are you located?",
    answer:
      "Our boarding page is based in Mahnomen, Minnesota. Please contact us before your visit to confirm the exact address, directions, and drop-off arrangements.",
  },
  {
    question: "What should I bring for my dog's stay?",
    answer:
      "Bring your dog's food, feeding instructions, and any medications with clear directions. A familiar item from home may also help your dog settle in. Contact us ahead of time to confirm what is welcome and what else your dog will need.",
  },
  {
    question: "Can you follow my dog's usual feeding or medication routine?",
    answer:
      "Please share your dog's normal routine and medication instructions when arranging a stay. We can discuss your dog's needs with you and confirm what care can be accommodated.",
  },
  {
    question: "What vaccinations or records are required?",
    answer:
      "Requirements can vary. Before booking, ask us which vaccinations and records to bring, and check with your veterinarian that your dog's records are current.",
  },
  {
    question: "How do I arrange drop-off and pick-up?",
    answer:
      "Please contact us before your dog's stay so we can confirm availability, dates, and drop-off and pick-up times.",
  },
  {
    question: "Can I check in about my dog while they're staying?",
    answer:
      "Let us know what kind of updates you would find helpful when you arrange the stay, and we can discuss how to keep in touch.",
  },
];

const Boarding = () => {
  return (
    <main className="boarding-page">
      <PageHero
        image={boardingImage}
        imageAlt="A dog enjoying time outdoors"
        eyebrow="Glacial Retrievers · Mahnomen, MN"
        title="A comfortable stay for your dog"
        description="Thoughtful boarding starts with understanding your dog’s routine and helping you feel prepared for their stay."
        linkText="Book Now"
        linkHref="/boarding-booking"
      />

      <section className="boarding-intro" id="boarding-details">
        <p className="boarding-eyebrow">Boarding at Glacial Retrievers</p>
        <h2>Care that starts with getting to know your dog</h2>
        <p>
          Every dog has their own routines, preferences, and care needs. When
          you contact us about boarding, tell us what helps your dog feel at
          ease, what they eat, and anything else we should know. We’ll talk
          through the details together so you know what to expect before you
          arrive.
        </p>
      </section>

      <section
        className="boarding-details"
        aria-label="Planning your dog's stay"
      >
        <article className="boarding-detail-card">
          <span className="boarding-detail-number">01</span>
          <h3>Share their routine</h3>
          <p>
            Let us know about meals, medication, comfort items, and any
            important needs or preferences.
          </p>
        </article>
        <article className="boarding-detail-card">
          <span className="boarding-detail-number">02</span>
          <h3>Confirm the arrangements</h3>
          <p>
            Ask about availability, stay dates, required records, and drop-off
            and pick-up times before booking.
          </p>
        </article>
        <article className="boarding-detail-card">
          <span className="boarding-detail-number">03</span>
          <h3>Get ready for check-in</h3>
          <p>
            Pack your dog’s food and care instructions, and confirm what else to
            bring with us ahead of the stay.
          </p>
        </article>
      </section>

      <section className="boarding-location">
        <div className="boarding-location-copy">
          <p className="boarding-eyebrow">Find us</p>
          <h2>Boarding in Mahnomen, Minnesota</h2>
          <p>
            Glacial Retrievers is located in Mahnomen, MN. Contact us before
            heading over and we’ll confirm the exact address, directions, and
            arrival arrangements.
          </p>
        </div>
        <div className="boarding-location-callout">
          <span className="boarding-location-label">Location</span>
          <strong>Mahnomen, MN</strong>
          <span>
            Exact address and directions available when you contact us.
          </span>
        </div>
      </section>

      <PageFaq
        id="boarding-faq"
        eyebrow="Before your dog's stay"
        title="Boarding questions"
        description="Have a question that isn’t covered here? Get in touch before booking so we can talk through your dog’s needs."
        questions={boardingQuestions}
      />

    </main>
  );
};

export default Boarding;
