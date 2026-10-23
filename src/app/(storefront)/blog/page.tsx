import type { Metadata } from "next";
import Image from "next/image";
import SiteLink from "@/app/(storefront)/_components/site-link";
import { blog } from "@/app/(storefront)/_lib/content";
import styles from "./blog.module.css";

export const metadata: Metadata = { title: blog.meta.title, description: blog.meta.description };

export default function StyleGuidePage() {
  return (
    <section className={styles.journal}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{blog.eyebrow}</p>
          <h1 className={styles.heading}>{blog.title}</h1>
          <p className={styles.intro}>{blog.intro}</p>
          <span className={styles.rule} />
        </header>
        <div className={styles.grid}>
          {blog.articles.map((article, i) => (
            <article
              key={article.href}
              className={styles.story}
              data-featured={article.featured || undefined}
            >
              <SiteLink
                href={article.href}
                className={styles.media}
                aria-label={article.title}
                tabIndex={-1}
              >
                {article.image && (
                  <Image
                    src={article.image.src}
                    alt={article.image.alt}
                    fill
                    sizes={
                      article.featured
                        ? "(max-width: 749px) 100vw, 780px"
                        : "(max-width: 749px) 100vw, 640px"
                    }
                    className={styles.image}
                    preload={i === 0}
                  />
                )}
              </SiteLink>
              <div className={styles.content}>
                <div className={styles.meta}>
                  <time dateTime={article.datetime ?? undefined}>{article.date}</time>
                </div>
                <h2 className={styles.title}>
                  <SiteLink href={article.href}>{article.title}</SiteLink>
                </h2>
                <p className={styles.excerpt}>{article.excerpt}</p>
                <SiteLink href={article.href} className={styles.read}>
                  {article.readLabel.replace(/→\s*$/, "").trim() || "Read story"}{" "}
                  <span aria-hidden="true">→</span>
                </SiteLink>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
