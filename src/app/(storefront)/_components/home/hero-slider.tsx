"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { srcOf, type HomeContent } from "@/app/(storefront)/_lib/content";
import SiteLink from "../site-link";
import styles from "./hero-slider.module.css";

type Slide = HomeContent["slides"][number];

const INTERVAL = 5500;

export default function HeroSlider({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (i: number) => setActive((i + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => go(active + 1), INTERVAL);
    return () => window.clearTimeout(id);
  }, [active, paused, go, slides.length]);

  return (
    <section
      className={styles.banner}
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div className={styles.track} style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((slide, i) => (
          <div
            className={styles.slide}
            key={srcOf(slide.desktop.src)}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            aria-hidden={i !== active}
          >
            <SiteLink
              href={slide.href}
              className={styles.link}
              aria-label={slide.label}
              tabIndex={i === active ? 0 : -1}
            >
              <picture>
                {slide.mobile && (
                  <source media="(max-width: 749px)" srcSet={srcOf(slide.mobile.src)} />
                )}
                <Image
                  className={styles.image}
                  src={slide.desktop.src}
                  alt={slide.desktop.alt}
                  width={slide.desktop.width ?? 3840}
                  height={slide.desktop.height ?? 1600}
                  sizes="100vw"
                  preload={i === 0}
                />
              </picture>
            </SiteLink>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className={styles.dots}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={styles.dot}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === active || undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
