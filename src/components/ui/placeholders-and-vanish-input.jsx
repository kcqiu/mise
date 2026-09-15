import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";
import { ArrowRight, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const PLACEHOLDER_INTERVAL = 3600;
const ANIMATION_DURATION = 460;

export function PlaceholdersAndVanishInput({
  placeholders,
  value,
  onChange,
  onSubmit,
  onClear,
  ariaLabel = "Search recipes",
}) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [animating, setAnimating] = useState(false);
  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (placeholders.length < 2) return undefined;

    let intervalId;
    const start = () => {
      if (!intervalId && document.visibilityState === "visible") {
        intervalId = window.setInterval(() => {
          setCurrentPlaceholder((current) =>
            (current + 1) % placeholders.length,
          );
        }, PLACEHOLDER_INTERVAL);
      }
    };
    const stop = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [placeholders.length]);

  useEffect(
    () => () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  const drawText = useCallback(() => {
    const input = inputRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!input || !canvas || !context || !value) return [];

    const bounds = input.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(bounds.width));
    const height = Math.max(1, Math.ceil(bounds.height));
    const styles = window.getComputedStyle(input);
    const fontSize = Number.parseFloat(styles.fontSize) || 14;

    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.font = `${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
    context.fillStyle = styles.color;
    context.textBaseline = "middle";
    context.fillText(value, 0, height / 2);

    const pixels = context.getImageData(0, 0, width, height).data;
    const particles = [];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        if (pixels[index + 3] > 80) {
          particles.push({
            x,
            y,
            color: `rgb(${pixels[index]}, ${pixels[index + 1]}, ${pixels[index + 2]})`,
            driftX: (Math.random() - 0.25) * 18,
            driftY: (Math.random() - 0.5) * 12,
          });
        }
      }
    }
    return particles;
  }, [value]);

  const vanish = useCallback(() => {
    if (!value || animating || prefersReducedMotion) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const particles = drawText();
    if (!canvas || !context || particles.length === 0) return;

    setAnimating(true);
    const startedAt = performance.now();
    const frame = (now) => {
      const progress = Math.min((now - startedAt) / ANIMATION_DURATION, 1);
      const eased = 1 - (1 - progress) ** 3;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = 1 - progress;

      particles.forEach((particle) => {
        context.fillStyle = particle.color;
        context.fillRect(
          particle.x + particle.driftX * eased,
          particle.y + particle.driftY * eased,
          1.35,
          1.35,
        );
      });

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(frame);
      } else {
        context.globalAlpha = 1;
        context.clearRect(0, 0, canvas.width, canvas.height);
        animationFrameRef.current = null;
        setAnimating(false);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(frame);
  }, [animating, drawText, prefersReducedMotion, value]);

  const handleSubmit = (event) => {
    event.preventDefault();
    vanish();
    onSubmit?.(event);
  };

  const placeholder = placeholders.length
    ? placeholders[currentPlaceholder % placeholders.length]
    : "";

  return (
    <LazyMotion features={domAnimation} strict>
      <form
        className="search-field vanish-input relative flex flex-1 items-center gap-3 w-full max-w-[460px] max-[768px]:max-w-none h-11 min-h-[44px] px-4 border border-ink/15 rounded-lg bg-white shadow-[0_1px_3px_rgba(36,35,31,0.04)] overflow-hidden transition-all focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/10"
        onSubmit={handleSubmit}
      >
        <Search
          className="vanish-input__search-icon shrink-0 text-muted"
          size={18}
          aria-hidden="true"
        />
        <div className="vanish-input__input-wrap relative flex-1 self-stretch min-w-0 flex items-center">
          <canvas
            ref={canvasRef}
            className={cn(
              "vanish-input__canvas absolute inset-0 pointer-events-none z-[2] w-full h-full transition-opacity duration-200",
              animating ? "opacity-100" : "opacity-0"
            )}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            className={cn(
              "vanish-input__input relative z-[1] w-full min-w-0 h-full p-0 border-0 outline-none bg-transparent text-ink font-sans text-sm max-[768px]:text-[15px] leading-[1.4] [&::-webkit-search-cancel-button]:hidden",
              animating && "text-transparent"
            )}
            type="search"
            value={value}
            onChange={(event) => {
              if (!animating) onChange(event);
            }}
            aria-label={ariaLabel}
            autoComplete="off"
          />
          <div
            className={cn(
              "vanish-input__placeholder absolute inset-0 pointer-events-none z-0 flex items-center overflow-hidden text-muted text-[13.5px] opacity-80",
              value ? "invisible" : ""
            )}
            aria-hidden="true"
          >
            <AnimatePresence mode="wait" initial={false}>
              {!value && (
                <m.span
                  key={placeholder}
                  className="truncate max-w-full"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1, y: 0 }
                      : { y: 5, opacity: 0 }
                  }
                  animate={{ y: 0, opacity: 1 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0, y: 0 }
                      : { y: -8, opacity: 0 }
                  }
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.24,
                    ease: "easeOut",
                  }}
                >
                  {placeholder}
                </m.span>
              )}
            </AnimatePresence>
          </div>
        </div>
        {value && (
          <button
            type="button"
            className="vanish-input__clear inline-flex shrink-0 items-center justify-center w-8 h-9 p-1 border-0 rounded-[3px] bg-transparent text-muted hover:text-ink cursor-pointer transition-colors"
            onClick={() => onClear?.()}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
        {!value && (
          <span
            className="vanish-input__prompt-icon inline-flex shrink-0 items-center justify-center w-[30px] h-[30px] -mr-[9px] text-muted opacity-55"
            aria-hidden="true"
          >
            <ArrowRight size={15} />
          </span>
        )}
      </form>
    </LazyMotion>
  );
}
