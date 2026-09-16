import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { ARTWORKS, RECIPE_IMAGES } from "../library";
import { cn } from "@/lib/utils";

export default function RecipeArtwork({ artwork, title, className = "" }) {
  const [hasError, setHasError] = useState(false);
  const index = ARTWORKS.indexOf(artwork);
  const isCustomImage = Boolean(
    artwork &&
      !hasError &&
      (artwork.startsWith("http://") ||
        artwork.startsWith("https://") ||
        artwork.startsWith("data:image/") ||
        artwork.startsWith("/")),
  );
  const image = RECIPE_IMAGES[artwork] || (isCustomImage ? artwork : null);

  useEffect(() => {
    setHasError(false);
  }, [artwork]);

  return (
    <div
      className={cn(
        "recipe-art relative isolate w-full aspect-[4/3] rounded-[16px] bg-[#e9eee5] overflow-hidden",
        index < 0 && !image && "recipe-art--type flex flex-col justify-center items-center gap-4 p-5 bg-[#e5eadf] text-[#56715b]",
        className
      )}
      aria-hidden="true"
    >
      {image ? (
        <img
          className="recipe-art__image block w-full h-full object-cover transition-transform duration-350"
          src={image}
          alt=""
          width="1000"
          height="1000"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : index >= 0 ? (
        <div
          className="recipe-art__tile absolute top-1/2 left-0 w-full aspect-square -translate-y-1/2 bg-no-repeat [background-size:300%_200%]"
          style={{
            backgroundImage: "url(/recipe/art/cookbook-atlas.webp)",
            backgroundPosition: `${(index % 3) * 50}% ${index < 3 ? 0 : 100}%`,
          }}
        />
      ) : (
        <>
          <Sprout size={42} strokeWidth={1.2} />
          <span className="font-serif italic text-[30px] leading-[1.2] text-center break-words max-w-full">
            {title?.split(" ").slice(0, 2).join(" ") || "Made at home"}
          </span>
          <span className="recipe-art__rule w-10 h-px bg-[#97ad93]" />
        </>
      )}
    </div>
  );
}
