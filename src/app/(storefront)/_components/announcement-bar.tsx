"use client";

import { useEffect, useState } from "react";
import styles from "./announcement-bar.module.css";

type Props = { heading: string; endsAt: string | null; ticker: string[] };

const pad = (n: number) => String(n).padStart(2, "0");

function remaining(endsAt: string) {
  const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    done: ms === 0,
    d: Math.floor(s / 86400),
    h: Math.floor(s / 3600) % 24,
    m: Math.floor(s / 60) % 60,
    s: s % 60,
  };
}

// Fixed bar: offer countdown on top, scrolling offers ticker below.
export default function AnnouncementBar({ heading, endsAt, ticker }: Props) {
  const [time, setTime] = useState<ReturnType<typeof remaining> | null>(null);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setTime(remaining(endsAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const showCountdown = Boolean(endsAt) && !time?.done;

  // The sticky/fixed header sits below this bar, so publish its height.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sf-ticker-height",
      showCountdown ? "64px" : "34px",
    );
  }, [showCountdown]);
  // Repeat the offers so the track is always wider than the viewport.
  const group = ticker.length ? ticker : [];

  return (
    <>
      <div className={styles.bar} data-countdown={showCountdown || undefined}>
        {showCountdown && (
          <div className={styles.countdown}>
            <span className={styles.heading}>{heading}</span>
            <span
              className={styles.timer}
              role="timer"
              aria-label="Time remaining until the offer ends"
            >
              <span>{pad(time?.d ?? 0)}d</span> <span>{pad(time?.h ?? 0)}h</span>{" "}
              <span>{pad(time?.m ?? 0)}m</span>{" "}
              <span className={styles.seconds}>{pad(time?.s ?? 0)}s</span>
            </span>
          </div>
        )}
        <div className={styles.ticker} aria-label="Offers">
          <div className={styles.track}>
            {[0, 1, 2, 3].map((copy) => (
              <div className={styles.group} key={copy} aria-hidden={copy > 0 || undefined}>
                {group.map((item, i) => (
                  <div className={styles.item} key={i}>
                    <span>{item}</span>
                    <span className={styles.symbol} aria-hidden="true">
                      ✦
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        className={styles.spacer}
        data-countdown={showCountdown || undefined}
        aria-hidden="true"
      />
    </>
  );
}
