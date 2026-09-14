import { Sprout } from "lucide-react";
import { ARTWORKS, RECIPE_IMAGES } from "../library";

export default function RecipeArtwork({ artwork, title, className = "" }) {
  const index = ARTWORKS.indexOf(artwork);
  const image = RECIPE_IMAGES[artwork];
  return (
    <div
      className={`recipe-art ${index < 0 ? "recipe-art--type" : ""} ${className}`}
      aria-hidden="true"
    >
      {image ? (
        <img
          className="recipe-art__image"
          src={image}
          alt=""
          width="1000"
          height="1000"
          loading="lazy"
          decoding="async"
        />
      ) : index >= 0 ? (
        <div
          className="recipe-art__tile"
          style={{
            backgroundPosition: `${(index % 3) * 50}% ${index < 3 ? 0 : 100}%`,
          }}
        />
      ) : (
        <>
          <Sprout size={42} strokeWidth={1.2} />
          <span>
            {title?.split(" ").slice(0, 2).join(" ") || "Made at home"}
          </span>
          <span className="recipe-art__rule" />
        </>
      )}
    </div>
  );
}
