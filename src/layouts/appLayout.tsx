import { useLocation, Outlet } from "react-router-dom";
import Footer, {
  type FooterContent,
} from "../components/footer/footer.tsx";
import Header from "../components/header/header.tsx";
import "./appLayout.css";

const defaultFooterContent: FooterContent = {
  eyebrow: "Glacial Retrievers",
  title: "Let’s talk about your dog",
  description:
    "Get in touch with your questions and tell us what you’re looking for. We’ll be happy to talk through the next steps.",
  note: "We look forward to hearing from you.",
};

const footerContentByPath: Record<string, FooterContent> = {
  "/training": {
    eyebrow: "Start a conversation",
    title: "Let’s talk about your dog",
    description:
      "Share your dog’s age, experience, and what you’d like to work on. We can discuss whether training is a good fit and what a next step could look like.",
    note: "Contact the kennel to talk with the trainer about your dog.",
  },
  "/boarding": {
    eyebrow: "Mahnomen, Minnesota",
    title: "Let’s plan your dog’s stay",
    description:
      "Contact us with your preferred dates, your dog’s routine, and any questions. We’ll confirm availability and go over the details with you.",
    note: "Please confirm availability and arrival details before visiting.",
  },
  "/puppies": {
    eyebrow: "Take the next step",
    title: "Looking for the right puppy?",
    description:
      "Get in touch to confirm current availability, ask about an upcoming litter, or talk through the kind of companion you’re looking for.",
    note: "Puppy availability can change. Please confirm before making plans.",
  },
};

const AppLayout = () => {
  const { pathname } = useLocation();
  const footerContent = footerContentByPath[pathname] ?? defaultFooterContent;

  return (
    <div className="app-root">
      <div className="titleBarWrapper">
        <Header />
      </div>
      <div className="contentWrapper">
        <Outlet />
      </div>
      <Footer content={footerContent} />
    </div>
  );
};

export default AppLayout;
