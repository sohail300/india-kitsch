"use client";

import { useId, useState, type ReactNode } from "react";
import { PlusIcon } from "./icons";
import styles from "./footer.module.css";

// Always expanded on desktop; an accordion on mobile.
export default function FooterColumn({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.column} data-open={open || undefined}>
      <h3 className={styles.columnHeadingWrap}>
        <button
          type="button"
          className={styles.columnHeading}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{heading}</span>
          <PlusIcon className={styles.columnIcon} />
        </button>
      </h3>
      <div id={id} className={styles.columnBody}>
        {children}
      </div>
    </div>
  );
}
