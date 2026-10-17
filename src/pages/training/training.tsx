import { useRef, useState, type KeyboardEvent } from "react";
import trainingImage from "../../assets/trainingImage.jpg";
import PageContact from "../../components/pageContact/pageContact.tsx";
import PageFaq, {
  type PageQuestion,
} from "../../components/pageFaq/pageFaq.tsx";
import PageHero from "../../components/pageHero/pageHero.tsx";
import "./training.css";

const trainingTracks = [
  {
    id: "retrievers",
    label: "Retrievers",
    introduction:
      "Build the foundations for a reliable retrieving partner, with lessons paced to the individual dog.",
    focusAreas: [
      "Basic cues, recall, and calm focus around distractions",
      "Confidence carrying and delivering an object to hand",
      "Introduction to marked retrieves and handling at an appropriate pace",
      "Field, cover, and water introductions when suitable for the dog",
    ],
  },
  {
    id: "pointers",
    label: "Pointers",
    introduction:
      "Develop a bird dog's natural search and pointing instincts while building cooperation and control.",
    focusAreas: [
      "Foundational recall and response to the handler",
      "Introduction to scent, bird contact, and field search",
      "Encouraging confident pointing and honoring foundations",
      "Steadiness and further field skills as the dog is ready",
    ],
  },
  {
    id: "flushers",
    label: "Flushers",
    introduction:
      "Work on purposeful hunting, responsiveness, and retrieving skills for dogs that find and flush birds.",
    focusAreas: [
      "Recall, range, and staying connected with the handler",
      "Searching cover and building confidence in the field",
      "Introduction to bird contact and a controlled flush",
      "Retrieving and delivery foundations suited to the dog",
    ],
  },
  {
    id: "puppies",
    label: "Puppies",
    introduction:
      "Keep early learning positive and age-appropriate, building confidence before asking for more advanced work.",
    focusAreas: [
      "Name recognition, recall games, and short learning sessions",
      "Comfort with handling, new surfaces, sounds, and environments",
      "Positive introductions to retrieving and field experiences",
      "Rest, play, and confidence-building at the puppy's pace",
    ],
  },
  {
    id: "house-training",
    label: "House Training",
    introduction:
      "Establish helpful everyday habits with consistent routines and clear communication between dog and family.",
    focusAreas: [
      "Creating a predictable bathroom and meal routine",
      "Rewarding the behaviors you want to see repeated",
      "Building comfort with settling and time alone gradually",
      "Sharing a simple plan for continuing the routine at home",
    ],
  },
];

const trainingQuestions: PageQuestion[] = [
  {
    question: "How long will my dog need training?",
    answer:
      "It depends on your dog's experience, goals, and the skills you would like to work on. We’ll talk through those goals with you and recommend a suitable training plan and timeline before your dog starts.",
  },
  {
    question: "What age can my dog come in for training?",
    answer:
      "The right age depends on the dog and the type of training. Young dogs can begin building confidence and basic skills, while more advanced work can wait until they are ready. We’ll help you decide on an appropriate starting point for your dog.",
  },
  {
    question: "How often is the dog worked?",
    answer:
      "Training is built into your dog's routine and adjusted to their age, ability, and progress. We’ll explain the expected schedule and how rest, exercise, and individual training sessions fit together before enrollment.",
  },
  {
    question: "Can I contact the trainer?",
    answer:
      "Yes. We’ll discuss the best way to contact the trainer and how you can get updates before training begins. You can also share questions or goals so the plan is tailored to your dog.",
  },
];

const Training = () => {
  const [selectedTrack, setSelectedTrack] = useState(trainingTracks[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeTrack =
    trainingTracks.find((track) => track.id === selectedTrack) ??
    trainingTracks[0];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = trainingTracks.findIndex(
      (track) => track.id === selectedTrack,
    );
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % trainingTracks.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + trainingTracks.length) % trainingTracks.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = trainingTracks.length - 1;
    }

    if (nextIndex !== undefined) {
      event.preventDefault();
      const nextTrack = trainingTracks[nextIndex];
      setSelectedTrack(nextTrack.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <main className="training-page">
      <PageHero
        image={trainingImage}
        imageAlt="A dog taking part in a training session"
        eyebrow="Glacial Retrievers"
        title="Gun Dog Training"
        description="Thoughtful, practical training that helps you and your dog build skills together."
        linkText="Explore training"
        linkHref="#training-programs"
      />

      <section className="training-intro">
        <p className="training-eyebrow">A plan for your dog</p>
        <h2>Confident dogs, capable partners</h2>
        <p>
          Every dog arrives with a different personality, experience, and set of
          goals. We start by learning what you hope to accomplish, then shape
          training around your dog’s needs and progress. Whether you’re building
          a foundation or developing field skills, the aim is steady, positive
          progress you can continue together.
        </p>
      </section>

      <section className="training-programs" id="training-programs">
        <div className="training-programs-heading">
          <p className="training-eyebrow">Training paths</p>
          <h2>Different dogs, different goals</h2>
          <p>
            Choose a training focus to see the kinds of skills we may work on.
            Pointers and flushers are hunting styles, not breed labels, and
            every plan is adjusted to the individual dog.
          </p>
        </div>

        <div
          className="training-tabs"
          role="tablist"
          aria-label="Training programs"
          onKeyDown={handleTabKeyDown}
        >
          {trainingTracks.map((track, index) => (
            <button
              key={track.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              className="training-tab"
              id={`training-tab-${track.id}`}
              type="button"
              role="tab"
              aria-selected={selectedTrack === track.id}
              aria-controls={`training-panel-${track.id}`}
              tabIndex={selectedTrack === track.id ? 0 : -1}
              onClick={() => setSelectedTrack(track.id)}
            >
              {track.label}
            </button>
          ))}
        </div>

        <div
          className="training-program-panel"
          id={`training-panel-${activeTrack.id}`}
          role="tabpanel"
          aria-labelledby={`training-tab-${activeTrack.id}`}
          tabIndex={0}
        >
          <div className="training-program-copy">
            <h3>{activeTrack.label}</h3>
            <p>{activeTrack.introduction}</p>
          </div>
          <ul className="training-program-list">
            {activeTrack.focusAreas.map((focusArea) => (
              <li key={focusArea}>{focusArea}</li>
            ))}
          </ul>
        </div>
        <p className="training-program-note">
          These are examples of possible training topics, not a fixed package.
          We’ll discuss your dog’s age, experience, and goals to determine what
          is appropriate.
        </p>
      </section>

      <section className="training-steps" aria-label="Our training approach">
        <article className="training-step">
          <span className="training-step-number">01</span>
          <h3>Talk through your goals</h3>
          <p>
            Tell us about your dog, their experience, and the skills you want to
            develop.
          </p>
        </article>
        <article className="training-step">
          <span className="training-step-number">02</span>
          <h3>Build a suitable plan</h3>
          <p>
            We’ll discuss timing, training priorities, and what is appropriate
            for your dog.
          </p>
        </article>
        <article className="training-step">
          <span className="training-step-number">03</span>
          <h3>Keep you involved</h3>
          <p>
            Stay in touch with the trainer and learn how to carry your dog’s
            progress forward at home.
          </p>
        </article>
      </section>

      <PageFaq
        id="training-faq"
        eyebrow="Good to know"
        title="Training questions"
        description="Every dog is different. These answers are a starting point; we’ll talk through the details with you before making a plan."
        questions={trainingQuestions}
      />

      <PageContact
        eyebrow="Start a conversation"
        title="Let’s talk about your dog"
        description="Share your dog’s age, experience, and what you’d like to work on. We can discuss whether training is a good fit and what a next step could look like."
        note="Contact the kennel to talk with the trainer about your dog."
      />
    </main>
  );
};

export default Training;
