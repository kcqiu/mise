import { useEffect, useState } from "react";
import { ExternalLink, Play, PlaySquare } from "lucide-react";
import { getRecipeVideo } from "../library";

export default function RecipeVideo({ sourceVideo, recipeTitle }) {
  const [showPlayer, setShowPlayer] = useState(false);
  const video = getRecipeVideo(sourceVideo);

  useEffect(() => setShowPlayer(false), [sourceVideo]);

  if (!video) return null;

  return (
    <section
      className="recipe-video border-b border-line grid grid-cols-[minmax(0,1fr)_minmax(280px,360px)] max-[800px]:grid-cols-[minmax(0,1fr)_minmax(250px,300px)] max-[580px]:grid-cols-1 items-center gap-[52px] max-[800px]:gap-8 max-[580px]:gap-[22px] py-[46px] max-[580px]:py-[31px] scroll-mt-[90px] outline-none focus:outline-2 focus:outline-terracotta focus:outline-offset-[5px]"
      id="video"
      tabIndex={-1}
    >
      <div className="recipe-video__copy max-w-[520px]">
        <span className="eyebrow block text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">
          Source video
        </span>
        <h2 className="font-serif font-normal text-[31px] max-[580px]:text-[29px] leading-[1.18] mt-[9px] mb-3 text-ink">
          See the technique.
        </h2>
        <p className="text-muted m-0 mb-[19px] text-sm max-[580px]:text-[13px] leading-[1.75]">
          Watch the original {video.label} when a visual cue helps,
          then come back to the written steps when your hands are busy.
        </p>
        <a
          className="text-button recipe-video__source-link inline-flex items-center gap-1.5 text-xs font-[550] text-[#234d3c] hover:text-[#183529] cursor-pointer transition-colors duration-150"
          href={video.url}
          target="_blank"
          rel="noreferrer"
        >
          Open on {video.provider}
          <ExternalLink size={15} />
        </a>
      </div>
      <div className="recipe-video__player aspect-[9/16] border border-line bg-[#edf2e9] rounded-lg justify-self-end max-[580px]:justify-self-start w-[min(100%,360px)] min-h-[500px] max-[800px]:min-h-[430px] max-[580px]:min-h-0 overflow-hidden">
        {showPlayer && video.embedUrl ? (
          <iframe
            src={video.embedUrl}
            title={`${recipeTitle} source video on ${video.provider}`}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full h-full bg-white border-0 block"
          />
        ) : video.embedUrl ? (
          <button
            className="recipe-video__launch w-full h-full min-h-[500px] max-[800px]:min-h-[430px] max-[580px]:min-h-0 max-[580px]:aspect-[9/16] text-ink text-left cursor-pointer bg-[#edf2e9] border-0 flex items-center justify-center gap-[13px] p-6 no-underline hover:bg-[#234d3c] hover:text-white transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-terracotta focus-visible:outline-offset-[-5px]"
            type="button"
            onClick={() => setShowPlayer(true)}
          >
            <span className="recipe-video__play-icon border border-current rounded-full shrink-0 w-[47px] h-[47px] grid place-items-center" aria-hidden="true">
              <Play size={21} fill="currentColor" />
            </span>
            <span className="flex flex-col gap-1">
              <strong className="text-sm font-[650]">Play source video</strong>
              <small className="text-inherit opacity-70 text-[10px]">{video.label}</small>
            </span>
          </button>
        ) : (
          <a
            className="recipe-video__launch w-full h-full min-h-[500px] max-[800px]:min-h-[430px] max-[580px]:min-h-0 max-[580px]:aspect-[9/16] text-ink text-left cursor-pointer bg-[#edf2e9] border-0 flex items-center justify-center gap-[13px] p-6 no-underline hover:bg-[#234d3c] hover:text-white transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-terracotta focus-visible:outline-offset-[-5px]"
            href={video.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="recipe-video__play-icon border border-current rounded-full shrink-0 w-[47px] h-[47px] grid place-items-center" aria-hidden="true">
              <PlaySquare size={23} />
            </span>
            <span className="flex flex-col gap-1">
              <strong className="text-sm font-[650]">Watch on {video.provider}</strong>
              <small className="text-inherit opacity-70 text-[10px]">This link is not available for inline playback.</small>
            </span>
          </a>
        )}
      </div>
    </section>
  );
}
