import { useState } from "react";
import "./App.css";
import { RouterProvider } from "react-router-dom";
import { Router } from "./routing/router.tsx";
import Header from "./components/header/header.tsx";

function App() {
  return (
    <>
      <div className="app-root">
        <div className="titleBarWrapper">
          <Header />
        </div>
        <div className="contentWrapper">
          <RouterProvider router={Router} />
        </div>
      </div>
    </>
  );
}

export default App;
