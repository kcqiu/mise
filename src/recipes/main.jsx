import React from "react";
import { createRoot } from "react-dom/client";
import RecipeApp from "./RecipeApp";
import "./recipes.css";

createRoot(document.getElementById("recipe-root")).render(
  <React.StrictMode>
    <RecipeApp />
  </React.StrictMode>,
);
