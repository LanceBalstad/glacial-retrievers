import { useEffect } from "react";
import { useLocation, Outlet } from "react-router-dom";
import Footer, {
  type FooterContent,
} from "../components/footer/footer.tsx";
import Header from "../components/header/header.tsx";
import "./appLayout.css";

const defaultFooterContent: FooterContent = {
  eyebrow: "Glacial Retrievers",
  title: "Let's talk about your dog",
  description:
    "Get in touch with your questions and tell us what you’re looking for. We’ll be happy to talk through the next steps.",
  note: "We look forward to hearing from you.",
};

const footerContentByPath: Record<string, FooterContent> = {
  "/training": defaultFooterContent,
  "/boarding": defaultFooterContent,
  "/puppies": defaultFooterContent,
  "/all-dogs": defaultFooterContent,
  "/about": defaultFooterContent,
  "/admin": defaultFooterContent,
  "/admin-login": defaultFooterContent,
};

const AppLayout = () => {
  const { pathname } = useLocation();
  const footerContent = footerContentByPath[pathname] ?? defaultFooterContent;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

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
