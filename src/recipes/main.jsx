import React from "react";
import { createRoot } from "react-dom/client";
import RecipeApp from "./RecipeApp";
import "../tailwind.css";
import "../styles/special-effects.css";

createRoot(document.getElementById("recipe-root")).render(
  <React.StrictMode>
    <RecipeApp />
  </React.StrictMode>,
);
