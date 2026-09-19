import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { ARTWORKS, RECIPE_IMAGES } from "../library";
import { resolveRecipeCover } from "../cloud";
import { cn } from "@/lib/utils";

export default function RecipeArtwork({ artwork, title, className = "" }) {
  const [hasError, setHasError] = useState(false);
  const [resolvedCover, setResolvedCover] = useState(null);

  useEffect(() => {
    setHasError(false);
    let active = true;
    if (typeof artwork === "string" && artwork.startsWith("/recipe-covers/")) {
      resolveRecipeCover(artwork).then((url) => {
        if (active && url && url !== artwork) {
          setResolvedCover(url);
        }
      });
    } else {
      setResolvedCover(null);
    }
    return () => {
      active = false;
    };
  }, [artwork]);

  const effectiveArtwork = resolvedCover || artwork;
  const index = ARTWORKS.indexOf(effectiveArtwork);
  const isCustomImage = Boolean(
    effectiveArtwork &&
      !hasError &&
      (effectiveArtwork.startsWith("http://") ||
        effectiveArtwork.startsWith("https://") ||
        effectiveArtwork.startsWith("data:image/") ||
        (effectiveArtwork.startsWith("/") && !effectiveArtwork.startsWith("/recipe-covers/"))),
  );
  const image = RECIPE_IMAGES[effectiveArtwork] || (isCustomImage ? effectiveArtwork : null);


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
