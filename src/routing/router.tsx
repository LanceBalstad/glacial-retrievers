import { createBrowserRouter } from "react-router-dom";
import AppLayout from "../layouts/appLayout.tsx";
import Home from "../pages/home/home.tsx";
import About from "../pages/about/about.tsx";
import AdminDogs from "../pages/adminDogs/adminDogs.tsx";
import AdminHome from "../pages/adminHome/adminHome.tsx";
import AdminLogin from "../pages/adminLogin/adminLogin.tsx";
import AllDogs from "../pages/allDogs/allDogs.tsx";
import Boarding from "../pages/boarding/boarding.tsx";
import BoardingBooking from "../pages/boarding/boardingBooking.tsx";
import Puppies from "../pages/puppies/puppies.tsx";
import Training from "../pages/training/training.tsx";
import TrainingBooking from "../pages/training/trainingBooking.tsx";

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
      { path: "/all-dogs", element: <AllDogs /> },
      { path: "/boarding", element: <Boarding /> },
      { path: "/boarding-booking", element: <BoardingBooking /> },
      { path: "/puppies", element: <Puppies /> },
      { path: "/training", element: <Training /> },
      { path: "/training-booking", element: <TrainingBooking /> },
    ],
  },
]);
