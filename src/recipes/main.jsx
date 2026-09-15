import React from "react";
import { createRoot } from "react-dom/client";
import RecipeApp from "./RecipeApp";
import "../tailwind.css";
import "../styles/special-effects.css";
import "./recipes-base.css";
import "./recipes-detail-editor.css";
import "./recipes-grocery.css";

createRoot(document.getElementById("recipe-root")).render(
  <React.StrictMode>
    <RecipeApp />
  </React.StrictMode>,
);
