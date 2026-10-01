"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The 20-second product video, muted and looping. It plays only while on screen,
 * and not at all for people who ask for reduced motion: they get the poster and
 * the player controls instead.
 */
export function ProductFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      setReduced(motion.matches);
      if (visible && !motion.matches && !document.hidden) video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { threshold: 0.25 });
    observer.observe(video);
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <figure className="w-full">
      <video
        ref={ref}
        className="block w-full aspect-video rounded-xl border border-[var(--color-line-2)] bg-[var(--color-ink)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
        muted
        loop
        playsInline
        preload="metadata"
        controls={reduced}
        poster="/video/pipelinescore-product-v2-poster.jpg"
        aria-label="PipelineScore in 20 seconds: one command runs the tests on your machine, then the model board and the hardware board."
      >
        <source src="/video/pipelinescore-product-v2.mp4" type="video/mp4" media="(min-width: 1024px)" />
        <source src="/video/pipelinescore-product-v2-720.mp4" type="video/mp4" />
      </video>
    </figure>
  );
}
