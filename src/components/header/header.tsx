import React from "react";
import { HamburgerIcon } from "../icons/iconIndex";
import "./header.css";

export const Header = () => {
  return (
    <>
      <div className="header">
        <div className="left-items">
          <div className="title">
            <h1>Glacial Retrievers</h1>
          </div>
        </div>
        <div className="right-items">
          <div className="hamburger-icon">
            <HamburgerIcon />
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
