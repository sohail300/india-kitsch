import Image from "next/image";
import type { Shell } from "@/app/(storefront)/_lib/content";
import SiteLink from "./site-link";
import RichText from "./rich-text";
import FooterColumn from "./footer-column";
import { ArrowRight, FacebookIcon, InstagramIcon } from "./icons";
import styles from "./footer.module.css";

type Props = { footer: Shell["footer"] };

export default function Footer({ footer }: Props) {
  return (
    <footer className={styles.footer}>
      <section className={styles.fashion}>
        <Hoop />
        <div className={styles.pageWidth}>
          <div className={styles.fashionInner}>
            <div>
              <p className={styles.fashionEyebrow}>{footer.eyebrow}</p>
              <h2 className={styles.fashionHeading}>{footer.heading}</h2>
            </div>
            <SiteLink href={footer.cta.href} className={styles.fashionLink}>
              <span>{footer.cta.label}</span>
              <ArrowRight />
            </SiteLink>
          </div>
          <div className={styles.stitch} aria-hidden="true">
            <span />
            <svg viewBox="0 0 120 12" fill="none">
              <path
                d="M2 7c9-5 15-5 23 0s15 5 23 0 15-5 23 0 15 5 23 0 15-5 24 0"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span />
          </div>
        </div>
      </section>

      <div className={styles.main}>
        <div className={styles.pageWidth}>
          <div className={styles.mainGrid}>
            <div className={styles.brand}>
              <SiteLink href="/" className={styles.brandLink} aria-label="India Kitsch home">
                {footer.logo ? (
                  <Image
                    className={styles.logo}
                    src={footer.logo.src}
                    alt={footer.logo.alt || "India Kitsch"}
                    width={footer.logo.width ?? 1600}
                    height={footer.logo.height ?? 274}
                  />
                ) : (
                  <span className={styles.wordmark}>India Kitsch</span>
                )}
                <sup className={styles.trademark}>™</sup>
              </SiteLink>
              <div className={styles.follow}>
                <p className={styles.followEyebrow}>{footer.follow.eyebrow}</p>
                <h3 className={styles.followHeading}>{footer.follow.heading}</h3>
                <RichText html={footer.follow.html} className={`${styles.followText} rte`} />
                <div className={styles.followLinks}>
                  {footer.follow.links.map((link) => (
                    <SiteLink
                      key={link.href}
                      href={link.href}
                      className={styles.followLink}
                      aria-label={link.lines.join(" ")}
                    >
                      <span className={styles.followIcon}>
                        {link.network === "facebook" ? <FacebookIcon /> : <InstagramIcon />}
                      </span>
                      <span className={styles.followLabel}>
                        {link.lines.map((line, i) => (
                          <span
                            key={i}
                            className={i === 0 ? styles.followNetwork : styles.followCta}
                          >
                            {line}
                          </span>
                        ))}
                      </span>
                      <span className={styles.followArrow} aria-hidden="true">
                        ↗
                      </span>
                    </SiteLink>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.columns}>
              {footer.columns.map((col) => (
                <FooterColumn key={col.heading} heading={col.heading}>
                  {col.type === "links" && (
                    <ul className={styles.links}>
                      {col.links.map((link) => (
                        <li key={link.label}>
                          <SiteLink href={link.href}>{link.label}</SiteLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  {col.type === "contact" && (
                    <div className={styles.contactList}>
                      {col.links.map((link) => (
                        <SiteLink key={link.href} href={link.href} className={styles.contactItem}>
                          <span className={styles.contactLabel}>{link.parts[0]}</span>
                          <span>{link.parts.slice(1).join(" ")}</span>
                        </SiteLink>
                      ))}
                      {col.static.length > 0 && (
                        <div className={styles.contactItem}>
                          <span className={styles.contactLabel}>{col.static[0]}</span>
                          <span>{col.static.slice(1).join(" ")}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {col.type === "html" && (
                    <RichText html={col.html} className={`${styles.address} rte`} />
                  )}
                </FooterColumn>
              ))}
            </div>
          </div>

          <div className={styles.bottom}>
            <div className={styles.legal}>
              <span className={styles.ownership}>
                <span className={styles.ownershipBrand}>{footer.legal.brand}</span>{" "}
                <span>{footer.legal.ownership}</span>{" "}
                <span className={styles.ownershipBrand}>{footer.legal.company}</span>
              </span>
              <span className={styles.legalRow}>
                <span className={styles.copyright}>{footer.legal.copyright}</span>
                {footer.legal.links.map((link) => (
                  <SiteLink key={link.label} href={link.href} className={styles.legalLink}>
                    {link.label}
                  </SiteLink>
                ))}
              </span>
            </div>
            <div className={styles.payments}>
              <span className={styles.paymentLabel}>{footer.payments.label}</span>
              <ul className={styles.paymentList}>
                {footer.payments.cards.map((card) => (
                  <li key={card.name} className={styles.paymentCard} aria-label={card.name}>
                    {card.image ? (
                      <Image
                        src={card.image.src}
                        alt={card.image.alt || card.name}
                        width={card.image.width ?? 60}
                        height={card.image.height ?? 20}
                      />
                    ) : card.svg ? (
                      <span
                        className={styles.paymentSvg}
                        dangerouslySetInnerHTML={{ __html: card.svg }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        {footer.signature && (
          <div className={styles.signature} aria-hidden="true">
            {footer.signature}
          </div>
        )}
      </div>
    </footer>
  );
}

// Faint embroidery-hoop doodle in the corner of the top band.
function Hoop() {
  return (
    <svg className={styles.hoop} viewBox="0 0 240 240" fill="none" aria-hidden="true">
      <circle cx="120" cy="120" r="104" stroke="currentColor" strokeWidth="1.2" />
      <circle
        cx="120"
        cy="120"
        r="92"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeDasharray="3 5"
      />
      <path
        d="M60 150c22-28 42-44 64-48s40 4 58-12"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeDasharray="4 4"
      />
      <path d="M86 70l68 100M154 70 86 170" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />
    </svg>
  );
}
