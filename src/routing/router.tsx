import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../layouts/appLayout.tsx";
import Home from "../pages/home/home.tsx";
import About from "../pages/about/about.tsx";
import AllDogs from "../pages/allDogs/allDogs.tsx";
import Boarding from "../pages/boarding/boarding.tsx";
import Puppies from "../pages/puppies/puppies.tsx";
import Training from "../pages/training/training.tsx";

export const Router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/about", element: <About /> },
      { path: "/all-dogs", element: <AllDogs /> },
      { path: "/boarding", element: <Boarding /> },
      { path: "/puppies", element: <Puppies /> },
      { path: "/training", element: <Training /> },
    ],
  },
]);
