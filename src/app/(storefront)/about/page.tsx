import type { Metadata } from "next";
import Image from "next/image";
import RichText from "@/app/(storefront)/_components/rich-text";
import SiteLink from "@/app/(storefront)/_components/site-link";
import { story } from "@/app/(storefront)/_lib/content";
import styles from "./story.module.css";

export const metadata: Metadata = { title: story.meta.title, description: story.meta.description };

export default function OurStoryPage() {
  const { hero, chapters, principles, philosophy, closing } = story;
  return (
    <section className={styles.story}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{hero.eyebrow}</p>
            <RichText as="h1" html={hero.titleHtml} className={styles.heroTitle} />
            <RichText html={hero.html} className={`${styles.heroText} rte`} />
            <div className={styles.meta}>
              {hero.meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
          <figure className={styles.heroMedia}>
            <div className={styles.heroFrame}>
              <Image
                src={hero.image.src}
                alt={hero.image.alt}
                fill
                sizes="(max-width: 749px) 100vw, 576px"
                className={styles.image}
                preload
              />
            </div>
            <figcaption className={styles.caption}>{hero.caption}</figcaption>
          </figure>
        </header>

        <div className={styles.rule} />

        {chapters.map((chapter) => (
          <section
            key={chapter.index}
            className={styles.chapter}
            data-offset={chapter.offset || undefined}
          >
            <div className={styles.chapterIndex}>{chapter.index}</div>
            <div>
              <p className={styles.eyebrow}>{chapter.eyebrow}</p>
              <RichText as="h2" html={chapter.titleHtml} className={styles.chapterTitle} />
              <RichText html={chapter.html} className={`${styles.body} rte`} />
              {chapter.aside && (
                <div className={styles.aside}>
                  <p className={styles.eyebrow}>{chapter.aside.eyebrow}</p>
                  <p className={styles.asideLine}>{chapter.aside.line}</p>
                  <RichText html={chapter.aside.html} className={`${styles.asideText} rte`} />
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className={styles.principles}>
        <div className={styles.shell}>
          <div className={styles.principlesHead}>
            <div>
              <span className={styles.sectionNumber}>{principles.number}</span>
              <p className={styles.eyebrow}>{principles.eyebrow}</p>
            </div>
            <h2 className={styles.principlesTitle}>{principles.title}</h2>
          </div>
          <div className={styles.principlesGrid}>
            {principles.items.map((item) => (
              <article key={item.number} className={styles.principle}>
                <span className={styles.principleNumber}>{item.number}</span>
                <h3>{item.title}</h3>
                <RichText html={item.html} className="rte" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.philosophy}>
        <div className={styles.shell}>
          <p className={`${styles.eyebrow} ${styles.eyebrowLight}`}>{philosophy.eyebrow}</p>
          <RichText as="blockquote" html={philosophy.quoteHtml} className={styles.quote} />
        </div>
      </section>

      <div className={styles.shell}>
        <footer className={styles.closing}>
          <div>
            <p className={styles.eyebrow}>{closing.eyebrow}</p>
            <h2 className={styles.closingTitle}>{closing.title}</h2>
            <RichText html={closing.html} className={`${styles.closingText} rte`} />
          </div>
          {closing.links.length > 0 && (
            <div className={styles.closingLinks}>
              {closing.links.map((link) => (
                <SiteLink key={link.label} href={link.href} className={styles.closingLink}>
                  {link.label}
                </SiteLink>
              ))}
            </div>
          )}
        </footer>
      </div>
    </section>
  );
}
