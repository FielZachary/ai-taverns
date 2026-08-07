"use client";

import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

type ScrollProgressSliderProps = {
  className?: string;
  controls?: string;
  label?: string;
  minThumbHeight?: number;
};

type SliderMetrics = {
  isScrollable: boolean;
  progress: number;
  thumbHeight: number;
  thumbTop: number;
};

const sliderInset = 84;
const defaultMinThumbHeight = 58;

function scrollRoot() {
  return document.scrollingElement ?? document.documentElement;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ScrollProgressSlider({
  className,
  controls,
  label = "Page scroll",
  minThumbHeight = defaultMinThumbHeight
}: ScrollProgressSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<SliderMetrics>({
    isScrollable: false,
    progress: 0,
    thumbHeight: minThumbHeight,
    thumbTop: 0
  });

  const measure = useCallback(() => {
    const root = scrollRoot();
    const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
    const trackHeight = Math.max(0, window.innerHeight - sliderInset * 2);
    const isScrollable = maxScroll > 1 && trackHeight > 0;
    const progress = isScrollable
      ? clamp(window.scrollY / maxScroll, 0, 1)
      : 0;
    const thumbHeight = isScrollable
      ? clamp(
          (window.innerHeight / root.scrollHeight) * trackHeight,
          minThumbHeight,
          trackHeight
        )
      : minThumbHeight;
    const thumbTop = isScrollable
      ? progress * Math.max(0, trackHeight - thumbHeight)
      : 0;

    setMetrics({ isScrollable, progress, thumbHeight, thumbTop });
  }, [minThumbHeight]);

  const scrollToProgress = useCallback((nextProgress: number) => {
    const root = scrollRoot();
    const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);

    window.scrollTo({
      top: clamp(nextProgress, 0, 1) * maxScroll,
      behavior: "auto"
    });
  }, []);

  const progressFromPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current;

      if (!track) {
        return metrics.progress;
      }

      const rect = track.getBoundingClientRect();
      const travel = Math.max(1, rect.height - metrics.thumbHeight);

      return clamp(
        (clientY - rect.top - metrics.thumbHeight / 2) / travel,
        0,
        1
      );
    },
    [metrics.progress, metrics.thumbHeight]
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollToProgress(progressFromPointer(event.clientY));
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    scrollToProgress(progressFromPointer(event.clientY));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.16 : 0.06;
    const keyProgress: Record<string, number> = {
      ArrowDown: metrics.progress + step,
      ArrowRight: metrics.progress + step,
      ArrowUp: metrics.progress - step,
      ArrowLeft: metrics.progress - step,
      PageDown: metrics.progress + 0.32,
      PageUp: metrics.progress - 0.32,
      Home: 0,
      End: 1
    };
    const nextProgress = keyProgress[event.key];

    if (nextProgress === undefined) {
      return;
    }

    event.preventDefault();
    scrollToProgress(nextProgress);
  }

  useEffect(() => {
    measure();

    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);

    resizeObserver?.observe(document.body);

    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
    };
  }, [measure]);

  const style = {
    "--scroll-slider-thumb-height": `${metrics.thumbHeight}px`,
    "--scroll-slider-thumb-top": `${metrics.thumbTop}px`
  } as CSSProperties;

  return (
    <div
      aria-controls={controls}
      aria-hidden={!metrics.isScrollable}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(metrics.progress * 100)}
      className={[
        "scroll-progress-slider",
        metrics.isScrollable ? "scroll-progress-slider-visible" : "",
        className ?? ""
      ]
        .filter(Boolean)
        .join(" ")}
      onKeyDown={handleKeyDown}
      role="scrollbar"
      tabIndex={metrics.isScrollable ? 0 : -1}
    >
      <div
        className="scroll-progress-slider-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        ref={trackRef}
        style={style}
      >
        <span className="scroll-progress-slider-thumb" />
      </div>
    </div>
  );
}
