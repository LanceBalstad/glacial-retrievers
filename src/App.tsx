import { RouterProvider } from "react-router-dom";
import { Router } from "./routing/router.tsx";

function App() {
  return <RouterProvider router={Router} />;
}

export default App;
