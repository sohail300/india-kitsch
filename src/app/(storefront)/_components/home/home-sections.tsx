import Image from "next/image";
import type { home as homeData } from "@/app/(storefront)/_lib/content";
import { getProducts } from "@/app/(storefront)/_lib/content";
import SiteLink from "../site-link";
import ProductCard from "../product/product-card";
import { LeafIcon, LockIcon, ReturnIcon } from "../icons";
import styles from "./home.module.css";

type Home = typeof homeData;

export function SeoHeading({ text }: { text: string }) {
  return (
    <section className={styles.seo}>
      <h1 className={styles.seoTitle}>{text}</h1>
    </section>
  );
}

export function ShopByFabric({ fabric }: { fabric: Home["fabric"] }) {
  return (
    <section className={styles.fabric}>
      <div className={styles.fabricShell}>
        <header className={styles.fabricHeader}>
          <p className={styles.fabricEyebrow}>{fabric.eyebrow}</p>
          <h2 className={styles.fabricHeading}>{fabric.heading}</h2>
          <span className={styles.fabricRule} />
        </header>
        <div className={styles.fabricGrid}>
          {fabric.cards.map((card) => (
            <article key={card.title} className={styles.fabricCard}>
              <SiteLink href={card.href} className={styles.fabricLink}>
                <Image
                  src={card.image.src}
                  alt={card.image.alt}
                  fill
                  sizes="(max-width: 749px) 50vw, 600px"
                  className={styles.fabricImage}
                />
                <span className={styles.fabricShade} />
                <h3 className={styles.fabricTitle}>{card.title}</h3>
              </SiteLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MostLoved({ section }: { section: Home["mostLoved"] }) {
  return (
    <section className={styles.split}>
      <div className={styles.splitLayout}>
        <h2 className={styles.splitHeading}>{section.heading}</h2>
        <div className={styles.splitProducts}>
          {getProducts(section.products).map((p) => (
            <ProductCard
              key={p.handle}
              product={p}
              variant="split"
              sizes="(max-width: 749px) 85vw, 360px"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const TRUST_ICONS = { leaf: LeafIcon, return: ReturnIcon, lock: LockIcon };

export function TrustStrip({ items }: { items: Home["trust"] }) {
  return (
    <section className={styles.trust}>
      <div className={styles.trustStrip}>
        {items.map((item) => {
          const Icon = TRUST_ICONS[item.icon] ?? LeafIcon;
          return (
            <div key={item.title} className={styles.trustItem}>
              <div className={styles.trustIcon}>
                <Icon />
              </div>
              <div className={styles.trustCopy}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <span className={styles.trustMobile}>{item.mobileLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function NewEdit({ section }: { section: Home["newEdit"] }) {
  return (
    <section className={styles.newEdit}>
      <div className={styles.newEditHeader}>
        <h2 className={styles.sectionHeading}>{section.heading}</h2>
      </div>
      <div className={styles.newEditRail}>
        {getProducts(section.products).map((p) => (
          <div key={p.handle} className={styles.newEditSlide}>
            <ProductCard product={p} variant="edit" sizes="(max-width: 749px) 85vw, 305px" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SignatureDesigns({ section }: { section: Home["signature"] }) {
  return (
    <section className={styles.signature}>
      <div className={styles.signatureInner}>
        <h2 className={styles.sectionHeading}>{section.heading}</h2>
        <div className={styles.signatureTrack}>
          {getProducts(section.products).map((p) => (
            <ProductCard
              key={p.handle}
              product={p}
              variant="signature"
              sizes="(max-width: 749px) 85vw, 450px"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function Editorial({ section }: { section: Home["editorial"] }) {
  const words = section.words;
  return (
    <section className={styles.editorial}>
      <div className={styles.editorialBackground} aria-hidden="true">
        <span className={styles.wash} />
        <span className={styles.arch}>
          <span className={styles.archInner} />
        </span>
        <span className={`${styles.crosses} ${styles.crossesOne}`}>× × ×</span>
        <span className={`${styles.crosses} ${styles.crossesTwo}`}>× ×</span>
        <span className={`${styles.loop} ${styles.loopOne}`} />
        <span className={`${styles.loop} ${styles.loopTwo}`} />
      </div>
      <div className={styles.marquee} aria-hidden="true">
        <div className={styles.marqueeTrack}>
          {[0, 1].map((copy) => (
            <div key={copy} className={styles.marqueeSet}>
              {words.map((word, i) => (
                <span key={i} className={styles.marqueeItem}>
                  <span className={word.outline ? styles.wordOutline : styles.wordSolid}>
                    {word.text}
                  </span>
                  <span className={styles.divider}>✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <span className="visually-hidden">{section.label}</span>
      {section.model && (
        <div className={styles.model}>
          <Image
            src={section.model.src}
            alt={section.model.alt}
            width={section.model.width ?? 1800}
            height={section.model.height ?? 2700}
            sizes="(max-width: 749px) 120vw, 680px"
            className={styles.modelImage}
          />
        </div>
      )}
    </section>
  );
}
