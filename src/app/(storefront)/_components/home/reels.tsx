"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeContent } from "@/app/(storefront)/_lib/content";
import { SoundOffIcon, SoundOnIcon } from "../icons";
import styles from "./home.module.css";

type Reel = HomeContent["reels"]["items"][number];

// Muted looping reels that play while on screen; one can be unmuted at a time.
export default function Reels({ heading, items }: { heading: string; items: Reel[] }) {
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [unmuted, setUnmuted] = useState<number | null>(null);
  // The play badge only shows after a visitor pauses a reel themselves.
  const [userPaused, setUserPaused] = useState<Record<number, boolean>>({});
  const [current, setCurrent] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  const onRailScroll = () => {
    const rail = railRef.current;
    const first = rail?.firstElementChild as HTMLElement | null;
    if (!rail || !first) return;
    const step = first.offsetWidth + parseFloat(getComputedStyle(rail).columnGap || "0");
    setCurrent(Math.min(items.length - 1, Math.round(rail.scrollLeft / Math.max(step, 1))));
  };

  const scrollToReel = (i: number) => {
    const rail = railRef.current;
    const target = rail?.children[i] as HTMLElement | undefined;
    if (rail && target)
      rail.scrollTo({ left: target.offsetLeft - rail.offsetLeft, behavior: "smooth" });
  };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && !reduce) video.play().catch(() => {});
          else video.pause();
        }
      },
      { threshold: 0.35 },
    );
    videos.current.forEach((v) => v && observer.observe(v));
    return () => observer.disconnect();
  }, []);

  const toggleSound = (i: number) => {
    videos.current.forEach((v, j) => {
      if (!v) return;
      v.muted = j !== i || unmuted === i;
    });
    setUnmuted((cur) => (cur === i ? null : i));
    videos.current[i]?.play().catch(() => {});
  };

  const togglePlay = (i: number) => {
    const v = videos.current[i];
    if (!v) return;
    const pausing = !v.paused;
    if (pausing) v.pause();
    else v.play().catch(() => {});
    setUserPaused((p) => ({ ...p, [i]: pausing }));
  };

  return (
    <section className={styles.reels}>
      <div className={styles.reelsContainer}>
        <h2 className={styles.reelsHeading}>{heading}</h2>
        <div className={styles.reelsRail} ref={railRef} onScroll={onRailScroll}>
          {items.map((reel, i) => (
            <article
              key={reel.label}
              className={styles.reel}
              aria-label={`Video ${i + 1} of ${items.length}`}
            >
              <div className={styles.reelMedia}>
                <video
                  ref={(el) => {
                    videos.current[i] = el;
                  }}
                  className={styles.reelVideo}
                  poster={typeof reel.poster === "string" ? reel.poster : reel.poster.src}
                  src={reel.video ?? undefined}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-label={reel.label}
                  onClick={() => togglePlay(i)}
                />
                <div className={styles.reelShade} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.reelSound}
                  aria-label={unmuted === i ? "Mute video" : "Unmute video"}
                  onClick={() => toggleSound(i)}
                >
                  {unmuted === i ? <SoundOnIcon /> : <SoundOffIcon />}
                </button>
                <span
                  className={styles.reelPlay}
                  data-visible={userPaused[i] || undefined}
                  aria-hidden="true"
                >
                  ▶
                </span>
              </div>
            </article>
          ))}
        </div>
        {items.length > 1 && (
          <div className={styles.reelDots}>
            {items.map((reel, i) => (
              <button
                key={reel.label}
                type="button"
                className={styles.reelDot}
                aria-label={`Show video ${i + 1}`}
                aria-current={i === current || undefined}
                onClick={() => scrollToReel(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
