import React, { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web/build/player/lottie_light";

interface LottiePlayerProps {
  /** Absolute or relative URL of the Lottie JSON, e.g. "/animations/globe.json". */
  src: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  onComplete?: () => void;
}

/**
 * Path-based lottie-web wrapper used on the platform (keeps large animations
 * out of the JS bundle — the JSON is fetched at runtime from /animations/).
 */
export default function LottiePlayer({
  src,
  className,
  loop = true,
  autoplay = true,
  speed = 1,
  onComplete,
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    // The player is decorative, so it loads with the first animation that
    // mounts instead of riding in the first-paint bundle (which has a 600 KB
    // budget). The light build has no After Effects expression engine, which
    // runs expressions through eval(), blocked by the CSP anyway.
    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (cancelled) return;
      const anim = lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop,
        autoplay,
        path: src,
      });
      anim.setSpeed(speed);
      if (onComplete) {
        anim.addEventListener("complete", () => onComplete());
      }
      animRef.current = anim;
    });
    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
