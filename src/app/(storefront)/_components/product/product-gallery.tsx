"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { srcOf, type Img } from "@/app/(storefront)/_lib/content";
import { ChevronLeft, ChevronRight } from "../icons";
import styles from "./product-card.module.css";

type Props = {
  images: Img[];
  title: string;
  sizes: string;
  controls: "arrows" | "pills";
  preload?: boolean;
};

// Swipeable image strip; desktop gets hover arrows or progress pills.
export default function ProductGallery({ images, title, sizes, controls, preload }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = (next + images.length) % images.length;
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (track) setIndex(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)));
  };

  return (
    <div className={styles.galleryInner}>
      <div className={styles.track} ref={trackRef} onScroll={onScroll}>
        {images.map((img, i) => (
          <div className={styles.slide} key={srcOf(img.src)}>
            <Image
              src={img.src}
              alt={img.alt || (i === 0 ? title : "")}
              fill
              sizes={sizes}
              className={styles.image}
              preload={preload && i === 0}
            />
          </div>
        ))}
      </div>
      {images.length > 1 && controls === "arrows" && (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowPrev}`}
            aria-label="Previous image"
            onClick={(e) => {
              e.preventDefault();
              go(index - 1);
            }}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.arrowNext}`}
            aria-label="Next image"
            onClick={(e) => {
              e.preventDefault();
              go(index + 1);
            }}
          >
            <ChevronRight />
          </button>
        </>
      )}
      {images.length > 1 && controls === "pills" && (
        <span className={styles.pills} aria-hidden="true">
          {images.map((img, i) => (
            <span
              key={srcOf(img.src)}
              className={styles.pill}
              data-active={i === index || undefined}
            />
          ))}
        </span>
      )}
    </div>
  );
}
