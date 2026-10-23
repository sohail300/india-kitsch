/**
 * Shared rendering helpers for every template - deliberately no
 * `import "server-only"` and no dependency on anything that has one
 * (e.g. `lib/money.ts`): `auth.tsx` in this directory is imported by
 * `server/auth/config.ts`, which must stay importable under plain tsx for
 * `scripts/create-admin.ts` (see config.ts's own comment). `server-only`
 * throws unconditionally under plain Node, not just in a browser context -
 * confirmed directly, not assumed - so anything in this file's import
 * chain has to stay clear of it. `@react-email/render` and its
 * dependencies are confirmed clear of it too (checked directly, not
 * assumed, the same way).
 *
 * Built with JSX + `@react-email/render`, not `@react-email/components` -
 * that component package is deprecated upstream ("no longer supported")
 * across every one of its sub-packages, so these are plain HTML tags
 * (table/tr/td, inline `style` objects) instead, which is what a
 * hand-written template would use anyway. `render()` itself remains
 * actively maintained by the same (Resend) team.
 *
 * Palette: a first pass used a bold magenta->marigold gradient everywhere
 * to read as "playful" - that read as generic/AI-made instead ("vibe
 * coded"), not polished. The actual lesson from the reference the owner
 * gave: mostly white/pastel surfaces, ONE accent color used sparingly
 * (button, one stepper dot, the order number), not color everywhere.
 * ACCENT #d23f18 (white text 4.70:1), HERO_BG #fff1ea, TEXT #2f231f
 * (15.21:1 on white), MUTED #6e605b (6.02:1 on white) - checked directly.
 * Font weights stay at 600 max throughout (never 700/800) - an earlier,
 * bolder pass read as heavy-handed.
 */
import { Fragment, type ReactNode } from "react";
import { render } from "@react-email/render";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Contact/footer info for order emails - every field is optional and only
 * ever populated from real /admin/settings values (server/modules/settings),
 * never fabricated. Absent fields are simply omitted from the email. */
export interface StoreContactInfo {
  email: string;
  phone?: string | null;
  addressLines: string[];
  social: { label: string; url: string }[];
}

export const ACCENT = "#d23f18";
const HERO_BG = "#fff1ea";
const CARD_BORDER = "#eadad3";
const TEXT_COLOR = "#2f231f";
const MUTED_COLOR = "#6e605b";
const TOTAL_BG = "#fdeee0";

/** Real icon glyphs via CDN `<img>` (never inline `<svg>` - Outlook desktop
 * doesn't render inline SVG at all, but an <img> pointing at one works
 * everywhere). Both pinned to an exact version, not `@latest`, so an icon
 * never silently changes/breaks after the fact - checked directly that
 * both resolve (HTTP 200) before wiring them in. */
const LUCIDE_VERSION = "1.48.0";
function lucideIconUrl(name: string): string {
  return `https://cdn.jsdelivr.net/npm/lucide-static@${LUCIDE_VERSION}/icons/${name}.svg`;
}
/** Simple Icons serves real brand marks as a colorable SVG via URL -
 * recolored to MUTED_COLOR so the footer stays one restrained tone instead
 * of each platform's own brand color. */
function simpleIconUrl(slug: string): string {
  return `https://cdn.simpleicons.org/${slug}/${MUTED_COLOR.replace("#", "")}`;
}

async function renderEmail(
  subject: string,
  body: ReactNode,
  hero?: ReactNode,
): Promise<RenderedEmail> {
  const element = (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-head-element -- this is an email document rendered by @react-email/render, not a Next.js page; next/head doesn't apply here. */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{subject}</title>
        {/* The 560px card itself is already fluid (width="100%", not a fixed
         * px width), so it scales down on any phone screen. What doesn't
         * scale on its own is the fixed 32px/36px cell padding (real room
         * on mobile at 320-375px viewports) and a couple of components that
         * assume desktop-width columns - see the `ik-*` class usages below
         * (OrderStepper's nowrap labels, AddressAndSummary's 52/48 split).
         * Media queries in a <style> tag are the one part of "responsive
         * email" every major mobile mail client (iOS/Android Mail, the
         * Gmail app) actually honors, even though several webmail clients
         * strip <style> from third-party HTML - this degrades safely to
         * the desktop layout there, just with more padding than ideal. */}
        <style>{`
          @media only screen and (max-width: 480px) {
            .ik-header-td { padding: 16px 20px !important; }
            .ik-hero-td { padding: 28px 20px !important; }
            .ik-card-td { padding: 24px 20px !important; }
            .ik-stepper-label { white-space: normal !important; }
            .ik-stack-td { display: block !important; width: 100% !important; padding-right: 0 !important; }
            .ik-stack-gap { padding-top: 16px !important; }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          padding: "24px 16px",
          backgroundColor: "#f3efec",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ maxWidth: 560, margin: "0 auto" }}
        >
          <tbody>
            <tr>
              <td
                className="ik-header-td"
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "16px 16px 0 0",
                  borderBottom: `1px solid ${CARD_BORDER}`,
                  padding: "20px 32px",
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>
                  India Kitsch
                </span>
              </td>
            </tr>
            {hero ? (
              <tr>
                <td
                  className="ik-hero-td"
                  style={{
                    backgroundColor: HERO_BG,
                    padding: "36px 32px",
                    textAlign: "center",
                  }}
                >
                  {hero}
                </td>
              </tr>
            ) : null}
            <tr>
              <td
                className="ik-card-td"
                style={{
                  backgroundColor: "#ffffff",
                  border: `1px solid ${CARD_BORDER}`,
                  borderTop: hero ? `1px solid ${CARD_BORDER}` : "none",
                  borderRadius: "0 0 16px 16px",
                  padding: "32px",
                  color: TEXT_COLOR,
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                {body}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "20px 8px 0", textAlign: "center" }}>
                <span style={{ fontSize: 12, color: MUTED_COLOR }}>
                  India Kitsch · This is a transactional email about your account or order.
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );

  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject, html, text };
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 600, color: TEXT_COLOR }}>
      {children}
    </p>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: "0 0 4px",
        fontSize: 17,
        fontWeight: 600,
        color: TEXT_COLOR,
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );
}

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "20px auto 0" }}>
      <tbody>
        <tr>
          <td {...{ bgcolor: ACCENT }} style={{ borderRadius: 10 }}>
            <a
              href={href}
              style={{
                display: "inline-block",
                padding: "13px 28px",
                fontSize: 15,
                fontWeight: 600,
                color: "#ffffff",
                textDecoration: "none",
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 13, color: MUTED_COLOR, margin: "16px 0 0", textAlign: "center" }}>
      {children}
    </p>
  );
}

export function Divider() {
  return <hr style={{ border: "none", borderTop: `1px solid ${CARD_BORDER}`, margin: "20px 0" }} />;
}

/** The order-lifecycle progress tracker from the owner's reference - three
 * steps, a filled accent dot with a checkmark once reached, connected by a
 * thin line. Steps not yet reached show a step-specific icon (truck for
 * "shipped", package for "delivered") instead of sitting empty, so every
 * dot always says what it represents, not just done/not-done. Table-based
 * (no flex/grid - email clients don't support them) so it degrades safely:
 * square corners instead of round dots in the handful of clients that
 * ignore border-radius on table cells, never a broken layout. */
export function OrderStepper({ current }: { current: "confirmed" | "shipped" | "delivered" }) {
  const steps = ["confirmed", "shipped", "delivered"] as const;
  const labels = { confirmed: "Order confirmed", shipped: "Shipped", delivered: "Delivered" };
  // "confirmed" is step 0 - it's only ever rendered done, never pending - so
  // it needs no pending icon of its own.
  const pendingIcon = { confirmed: "check", shipped: "truck", delivered: "package" };
  const currentIndex = steps.indexOf(current);

  function Dot({ step, done }: { step: (typeof steps)[number]; done: boolean }) {
    const icon = done ? "check" : pendingIcon[step];
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "0 auto" }}>
        <tbody>
          <tr>
            <td
              {...(done ? { bgcolor: ACCENT } : {})}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                backgroundColor: done ? ACCENT : "#ffffff",
                border: done ? "none" : `1.5px solid ${CARD_BORDER}`,
                textAlign: "center",
                lineHeight: "28px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- email document, not a Next.js page; see LineItems for the same reasoning. */}
              <img
                src={lucideIconUrl(icon)}
                width={14}
                height={14}
                alt=""
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                  // lucide-static ships `stroke="currentColor"`, which an <img>
                  // can't recolor directly - a CSS filter approximates white
                  // (done) or muted-brown (pending) instead of flat black.
                  filter: done
                    ? "brightness(0) invert(1)"
                    : "invert(37%) sepia(11%) saturate(716%) hue-rotate(340deg) brightness(94%)",
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: "24px 0 8px" }}
    >
      <tbody>
        <tr>
          {steps.map((step, i) => (
            <Fragment key={step}>
              <td width="1%" style={{ whiteSpace: "nowrap" }}>
                <Dot step={step} done={i <= currentIndex} />
              </td>
              {i < steps.length - 1 ? (
                <td
                  style={{
                    borderTop: `2px solid ${i < currentIndex ? ACCENT : CARD_BORDER}`,
                  }}
                />
              ) : null}
            </Fragment>
          ))}
        </tr>
        <tr>
          {steps.map((step, i) => (
            <Fragment key={step}>
              <td
                className="ik-stepper-label"
                style={{
                  fontSize: 11,
                  color: i <= currentIndex ? TEXT_COLOR : MUTED_COLOR,
                  fontWeight: i === currentIndex ? 600 : 400,
                  paddingTop: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {labels[step]}
              </td>
              {i < steps.length - 1 ? <td /> : null}
            </Fragment>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** Email + phone, side by side - only the fields the owner has actually
 * set in /admin/settings appear (a missing phone just means one cell). */
export function ContactGrid({ store }: { store: StoreContactInfo }) {
  const cells = [
    { label: "Email us", value: store.email, href: `mailto:${store.email}` },
    ...(store.phone ? [{ label: "Call us", value: store.phone, href: `tel:${store.phone}` }] : []),
  ];

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: "20px 0 0" }}
    >
      <tbody>
        <tr>
          {cells.map((cell, i) => (
            <td
              key={cell.label}
              style={{
                width: `${100 / cells.length}%`,
                paddingLeft: i > 0 ? 6 : 0,
                paddingRight: i < cells.length - 1 ? 6 : 0,
              }}
            >
              {/* The gutter above is real padding on the OUTER cell, not a
                  spacer column - a spacer <td> sized in px alongside cells
                  already sized to 100/n% gets squeezed to 0 by clients that
                  respect the percentages first (which is what produced the
                  "cells touching" bug this replaced). The colored box is a
                  nested table so the padding above stays transparent. */}
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td
                      {...{ bgcolor: HERO_BG }}
                      style={{ backgroundColor: HERO_BG, borderRadius: 10, padding: "14px 16px" }}
                    >
                      <p style={{ margin: "0 0 2px", fontSize: 12, color: MUTED_COLOR }}>
                        {cell.label}
                      </p>
                      <a
                        href={cell.href}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: TEXT_COLOR,
                          textDecoration: "none",
                        }}
                      >
                        {cell.value}
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** Simple Icons slugs for the platforms `getStoreContactInfo` can produce
 * (see notifications/service.ts) - the business only actually has Instagram
 * and Facebook accounts, so those are the only two ever configurable. */
const SOCIAL_SLUG: Record<string, string> = {
  Instagram: "instagram",
  Facebook: "facebook",
};

/** Social icons (only platforms the owner has actually linked in
 * /admin/settings) and the business address (only if set there too) -
 * renders nothing at all when neither is configured, rather than an empty
 * band. The always-present transactional-email disclosure line lives in
 * `renderEmail` itself, not here, so it never depends on this data. */
export function SocialAndAddress({ store }: { store: StoreContactInfo }) {
  if (store.social.length === 0 && store.addressLines.length === 0) return null;

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ marginTop: 24 }}
    >
      <tbody>
        {store.social.length > 0 ? (
          <tr>
            <td style={{ textAlign: "center", paddingBottom: 10 }}>
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                style={{ margin: "0 auto" }}
              >
                <tbody>
                  <tr>
                    {store.social.map((s) => (
                      <td key={s.label} style={{ padding: "0 6px" }}>
                        <a
                          href={s.url}
                          style={{
                            display: "inline-block",
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            backgroundColor: "#efe6e1",
                            textAlign: "center",
                            lineHeight: "28px",
                          }}
                        >
                          {SOCIAL_SLUG[s.label] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- email document, not a Next.js page; see LineItems for the same reasoning.
                            <img
                              src={simpleIconUrl(SOCIAL_SLUG[s.label]!)}
                              width={14}
                              height={14}
                              alt={s.label}
                              style={{ display: "inline-block", verticalAlign: "middle" }}
                            />
                          ) : (
                            s.label.charAt(0)
                          )}
                        </a>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        ) : null}
        {store.addressLines.length > 0 ? (
          <tr>
            <td style={{ textAlign: "center" }}>
              <span style={{ fontSize: 11, color: MUTED_COLOR }}>
                {store.addressLines.join(", ")}
              </span>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export { renderEmail, TOTAL_BG, TEXT_COLOR, MUTED_COLOR, CARD_BORDER };
