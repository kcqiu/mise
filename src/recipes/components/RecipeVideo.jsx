import { useEffect, useState } from "react";
import { ExternalLink, Play, PlaySquare } from "lucide-react";
import { getRecipeVideo } from "../library";

export default function RecipeVideo({ sourceVideo, recipeTitle }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const video = getRecipeVideo(sourceVideo);

  useEffect(() => setShowPlayer(false), [sourceVideo]);

  if (!video) return null;

  return (
    <section className="recipe-video" id="video" tabIndex={-1}>
      <div className="recipe-video__copy">
        <span className="eyebrow">Source video</span>
        <h2>See the technique.</h2>
        <p>
          Watch the original {video.label} when a visual cue helps,
          then come back to the written steps when your hands are busy.
        </p>
        <a
          className="text-button recipe-video__source-link"
          href={video.url}
          target="_blank"
          rel="noreferrer"
        >
          Open on {video.provider}
          <ExternalLink size={15} />
        </a>
      </div>
      <div className="recipe-video__player">
        {showPlayer && video.embedUrl ? (
          <iframe
            src={video.embedUrl}
            title={`${recipeTitle} source video on ${video.provider}`}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : video.embedUrl ? (
          <button
            className="recipe-video__launch"
            type="button"
            onClick={() => setShowPlayer(true)}
          >
            <span className="recipe-video__play-icon" aria-hidden="true">
              <Play size={21} fill="currentColor" />
            </span>
            <span>
              <strong>Play source video</strong>
              <small>{video.label}</small>
            </span>
          </button>
        ) : (
          <a
            className="recipe-video__launch"
            href={video.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="recipe-video__play-icon" aria-hidden="true">
              <PlaySquare size={23} />
            </span>
            <span>
              <strong>Watch on {video.provider}</strong>
              <small>This link is not available for inline playback.</small>
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
