import titleImage from "../../assets/titleImage.jpg";
import AvailableDogs from "../../components/availableDogs/availableDogs.tsx";
import PageFaq, {
  type PageQuestion,
} from "../../components/pageFaq/pageFaq.tsx";
import PageHero from "../../components/pageHero/pageHero.tsx";
import "./puppies.css";

const puppyQuestions: PageQuestion[] = [
  {
    question: "What should I focus on when training a puppy?",
    answer:
      "Start with short, positive experiences: name recognition, recall games, gentle handling, and learning about everyday sights and sounds. Keep activities age-appropriate and let your puppy rest between new experiences.",
  },
  {
    question: "When can a puppy start learning gun-dog skills?",
    answer:
      "Early foundations can be introduced through play and confidence-building, but each puppy develops at a different pace. More demanding field work should wait until the puppy is ready. Talk with a trainer about a suitable plan for your puppy.",
  },
  {
    question: "How do I know whether a puppy is available?",
    answer:
      "The listings below show puppies currently marked as available. Availability can change, so please contact us to confirm the puppy’s status and ask about next steps.",
  },
];

const Puppies = () => (
  <main className="puppies-page">
    <PageHero
      image={titleImage}
      imageAlt="Labradors outdoors"
      eyebrow="A good beginning"
      title="Puppies with room to grow"
      description="Meet available puppies and learn about the early, positive foundations that help a young dog thrive."
      linkText="Meet available puppies"
      linkHref="#available-puppies"
    />

    <section className="puppies-intro">
      <p className="puppies-eyebrow">Start with the foundations</p>
      <h2>Curiosity, confidence, and connection</h2>
      <p>
        Puppy training is about helping a young dog feel safe, build trust, and
        discover the world at a comfortable pace. Simple games and consistent
        routines create a strong starting point for family life and, when
        appropriate, future gun-dog training.
      </p>
    </section>

    <section
      className="puppy-foundations"
      aria-label="Puppy training foundations"
    >
      <article className="puppy-foundation-card">
        <span>01</span>
        <h3>Build a bond</h3>
        <p>
          Use play, kind handling, and rewards to help your puppy enjoy learning
          with you.
        </p>
      </article>
      <article className="puppy-foundation-card">
        <span>02</span>
        <h3>Explore at their pace</h3>
        <p>
          Introduce new people, places, sounds, and surfaces in calm,
          encouraging steps.
        </p>
      </article>
      <article className="puppy-foundation-card">
        <span>03</span>
        <h3>Keep it short and positive</h3>
        <p>
          Practice simple cues and recall through brief sessions balanced with
          play and plenty of rest.
        </p>
      </article>
    </section>

    <div className="puppies-listing" id="available-puppies">
      <AvailableDogs puppiesOnly />
    </div>

    <PageFaq
      id="puppy-questions"
      eyebrow="For new puppy families"
      title="Puppy questions"
      description="Every puppy is an individual. These general pointers are a starting place; ask us about your puppy’s needs and training goals."
      questions={puppyQuestions}
    />

  </main>
);

export default Puppies;
