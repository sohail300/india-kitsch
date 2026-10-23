"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Shell } from "@/app/(storefront)/_lib/content";
import { routePath } from "@/app/(storefront)/_lib/routes";
import SiteLink from "./site-link";
import {
  ArrowRight,
  BoxIcon,
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  SearchIcon,
  UserIcon,
} from "./icons";
import styles from "./mobile-drawer.module.css";

type Props = { header: Shell["header"]; open: boolean; onClose: () => void; pathname: string };

export default function MobileDrawer({ header, open, onClose, pathname }: Props) {
  const { drawer, nav } = header;
  const router = useRouter();
  const [panel, setPanel] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Closing the drawer always returns it to the root panel.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setPanel(null);
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Nav items with children map, in order, to the drawer's submenu panels.
  const submenuIndex = (navIndex: number) =>
    nav.slice(0, navIndex).filter((n) => n.children).length;
  const submenu = panel === null ? null : drawer.submenus[panel];
  const [shopLabel, supportLabel] = drawer.sectionLabels;

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
    onClose();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <div className={styles.root} data-open={open || undefined} aria-hidden={!open}>
      <div className={styles.backdrop} onClick={onClose} />
      <nav className={styles.drawer} aria-label="Mobile">
        <div className={styles.shell} data-panel={panel === null ? "root" : "sub"}>
          {/* Root panel */}
          <section className={styles.panel} inert={panel !== null || !open}>
            <div className={styles.topbar}>
              <div>
                <span className={styles.eyebrow}>{drawer.eyebrow}</span>
                <span className={styles.subtitle}>{drawer.subtitle}</span>
              </div>
              <button
                type="button"
                ref={closeRef}
                className={styles.iconButton}
                onClick={onClose}
                aria-label="Close menu"
              >
                <CloseIcon />
              </button>
            </div>
            <div className={styles.scroll}>
              <form className={styles.search} onSubmit={onSearch} role="search">
                <label className="visually-hidden" htmlFor="drawer-search">
                  Search products
                </label>
                <input
                  id="drawer-search"
                  name="q"
                  type="search"
                  placeholder={drawer.searchPlaceholder}
                  className={styles.searchInput}
                />
                <button type="submit" className={styles.searchSubmit} aria-label="Search">
                  <SearchIcon size={18} />
                </button>
              </form>

              {shopLabel && <div className={styles.sectionLabel}>{shopLabel}</div>}
              <ul className={styles.list}>
                {nav.map((item, i) => (
                  <li key={item.label} data-highlight={item.highlight || undefined}>
                    {item.children ? (
                      <button
                        type="button"
                        className={styles.row}
                        onClick={() => setPanel(submenuIndex(i))}
                      >
                        <span>{item.label}</span>
                        <ChevronRight />
                      </button>
                    ) : (
                      <SiteLink
                        href={item.href}
                        className={styles.row}
                        data-active={(item.href && routePath(item.href) === pathname) || undefined}
                        onClick={onClose}
                      >
                        <span>{item.label}</span>
                      </SiteLink>
                    )}
                  </li>
                ))}
              </ul>

              {supportLabel && <div className={styles.sectionLabel}>{supportLabel}</div>}
              <div className={styles.supportCard}>
                {drawer.support.map((row, i) => (
                  <SiteLink key={row.title} href={row.href} className={styles.supportRow}>
                    <span className={styles.supportIcon}>
                      {i === 0 ? <UserIcon size={18} /> : <BoxIcon size={18} />}
                    </span>
                    <span className={styles.supportCopy}>
                      <span className={styles.supportTitle}>{row.title}</span>
                      <span className={styles.supportSubtitle}>{row.subtitle}</span>
                    </span>
                    <ChevronRight />
                  </SiteLink>
                ))}
              </div>
            </div>
          </section>

          {/* Submenu panel */}
          <section className={styles.panel} inert={panel === null || !open}>
            {submenu && (
              <>
                <div className={styles.topbar}>
                  <button type="button" className={styles.back} onClick={() => setPanel(null)}>
                    <ChevronLeft />
                    <span>{submenu.label}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={onClose}
                    aria-label="Close menu"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className={styles.scroll}>
                  <div className={styles.sectionLabel}>{submenu.sectionLabel}</div>
                  <div className={styles.submenuCard}>
                    <SiteLink href={submenu.viewAll.href} className={styles.viewAll}>
                      <span className={styles.viewAllCopy}>
                        <strong>{submenu.viewAll.title}</strong>
                        <small>{submenu.viewAll.subtitle}</small>
                      </span>
                      <span className={styles.viewAllArrow}>
                        <ArrowRight />
                      </span>
                    </SiteLink>
                    <ul className={styles.list}>
                      {submenu.items.map((item) => (
                        <li key={item.title}>
                          <SiteLink href={item.href} className={styles.row}>
                            <span className={styles.rowCopy}>
                              <span>{item.title}</span>
                              {item.subtitle && <small>{item.subtitle}</small>}
                            </span>
                            <ChevronRight />
                          </SiteLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </nav>
    </div>
  );
}
