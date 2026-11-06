import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../layouts/appLayout.tsx";
import Home from "../pages/home/home.tsx";
import About from "../pages/about/about.tsx";
import AdminDocuments from "../pages/adminDocuments/adminDocuments.tsx";
import AdminDogs from "../pages/adminDogs/adminDogs.tsx";
import AdminHome from "../pages/adminHome/adminHome.tsx";
import AdminLogin from "../pages/adminLogin/adminLogin.tsx";
import AllDogs from "../pages/allDogs/allDogs.tsx";
import Boarding from "../pages/boarding/boarding.tsx";
import Puppies from "../pages/puppies/puppies.tsx";
import SignDocument from "../pages/signDocument/signDocument.tsx";
import Training from "../pages/training/training.tsx";

export const Router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/about", element: <About /> },
      { path: "/admin", element: <AdminLogin /> },
      { path: "/admin-login", element: <AdminLogin /> },
      { path: "/admin/home", element: <AdminHome /> },
      { path: "/admin/dogs", element: <AdminDogs /> },
      { path: "/admin/documents", element: <AdminDocuments /> },
      // Public signing page; the token in the link is the only key.
      { path: "/sign/:token", element: <SignDocument /> },
      { path: "/all-dogs", element: <AllDogs /> },
      { path: "/boarding", element: <Boarding /> },
      { path: "/puppies", element: <Puppies /> },
      { path: "/training", element: <Training /> },
    ],
  },
]);
