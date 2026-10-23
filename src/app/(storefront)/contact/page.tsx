import type { Metadata } from "next";
import RichText from "@/app/(storefront)/_components/rich-text";
import { contact } from "@/app/(storefront)/_lib/content";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: contact.meta.title,
  description: contact.meta.description,
};

export default function ContactPage() {
  return (
    <section className={styles.contact}>
      <div className={styles.inner}>
        <div className={styles.intro}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowLine} />
            <span>{contact.eyebrow}</span>
          </div>
          <h1 className={styles.heading}>{contact.heading}</h1>
          <RichText html={contact.descriptionHtml} className={`${styles.description} rte`} />
          <RichText html={contact.supportHtml} className={`${styles.support} rte`} />
        </div>
        <div className={styles.details}>
          {contact.details.map((detail) => (
            <div key={detail.label} className={styles.detail}>
              <span className={styles.label}>{detail.label}</span>
              <RichText html={detail.html} className={styles.value} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
