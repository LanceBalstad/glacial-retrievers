import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  auth,
  isAllowedAdminEmail,
  subscribeToAuth,
} from "../../lib/firebase";
import { HamburgerIcon } from "../icons/iconIndex";
import "./header.css";

const publicNavItems = [
  { label: "Home", to: "/" },
  { label: "Training", to: "/training" },
  { label: "All Dogs", to: "/all-dogs" },
  { label: "Boarding", to: "/boarding" },
  { label: "Puppies", to: "/puppies" },
];

const adminNavItems = [
  { label: "Home", to: "/admin/home" },
  { label: "Dogs", to: "/admin/dogs" },
];

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!auth) {
      setIsAdmin(false);
      return;
    }

    const unsubscribe = subscribeToAuth((nextUser) => {
      setIsAdmin(Boolean(nextUser && isAllowedAdminEmail(nextUser.email)));
    });

    return unsubscribe;
  }, []);

  const navItems = isAdmin ? adminNavItems : publicNavItems;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="header" ref={menuRef}>
      <div className="left-items">
        <NavLink to="/" className="title-link" onClick={() => setIsMenuOpen(false)}>
          <div className="title">
            <h1>Glacial Retrievers</h1>
          </div>
        </NavLink>
      </div>

      <nav className="desktop-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-link ${isActive ? "active" : ""}`.trim()
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="right-items">
        <div className="hamburger-wrapper">
          <button
            type="button"
            className="hamburger-button"
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <HamburgerIcon />
          </button>

          {isMenuOpen && (
            <nav className="mobile-dropdown" aria-label="Mobile navigation menu">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `dropdown-link ${isActive ? "active" : ""}`.trim()
                  }
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
