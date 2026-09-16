import React from "react";
import { createRoot } from "react-dom/client";
import RootPage from "./RootPage";
import "../tailwind.css";
import "../styles/special-effects.css";

createRoot(document.getElementById("recipe-root")).render(
  <React.StrictMode>
    <RootPage />
  </React.StrictMode>,
);
