import type { Metadata } from "next";
import RichText from "@/app/(storefront)/_components/rich-text";
import { faq } from "@/app/(storefront)/_lib/content";
import styles from "./faq.module.css";

export const metadata: Metadata = { title: faq.meta.title, description: faq.meta.description };

export default function FaqPage() {
  return (
    <section className={styles.faq}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{faq.eyebrow}</p>
          <h1 className={styles.heading}>{faq.heading}</h1>
          <RichText html={faq.introHtml} className={`${styles.intro} rte`} />
          <RichText as="p" html={faq.identityHtml} className={styles.identity} />
        </header>
        <div className={styles.content}>
          {faq.categories.map((category) => (
            <div key={category.title}>
              {category.title && (
                <div className={styles.category}>
                  <h2>{category.title}</h2>
                  {category.description && <p>{category.description}</p>}
                </div>
              )}
              {category.items.map((item) => (
                <details key={item.question} className={styles.item}>
                  <summary className={styles.question}>
                    <span>{item.question}</span>
                    <span className={styles.icon} aria-hidden="true">
                      <span className={styles.iconH} />
                      <span className={styles.iconV} />
                    </span>
                  </summary>
                  <RichText html={item.html} className={`${styles.answer} rte`} />
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
