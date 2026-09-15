import React from "react";
import { createRoot } from "react-dom/client";
import RecipeApp from "./RecipeApp";
import "./recipes-base.css";
import "./recipes-detail-editor.css";
import "./recipes-overlays.css";
import "./recipes-grocery.css";
import "./recipes-library.css";

createRoot(document.getElementById("recipe-root")).render(
  <React.StrictMode>
    <RecipeApp />
  </React.StrictMode>,
);
