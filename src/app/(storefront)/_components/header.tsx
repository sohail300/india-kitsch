"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { openCart, useCartLines } from "@/app/(storefront)/_lib/cart";
import type { Shell } from "@/app/(storefront)/_lib/content";
import { routePath } from "@/app/(storefront)/_lib/routes";
import { useWishlist } from "@/app/(storefront)/_lib/wishlist";
import SiteLink from "./site-link";
import MobileDrawer from "./mobile-drawer";
import { BagIcon, BoxIcon, ChevronDown, HeartIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";
import styles from "./header.module.css";

type Props = { header: Shell["header"] };

export default function Header({ header }: Props) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { items } = useWishlist();
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Close dropdowns on outside click / Escape and whenever the route changes.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Reset menus when the route changes (state adjusted during render, not in an effect).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpenMenu(null);
    setDrawerOpen(false);
  }

  // Homepage header sits in the page flow until it scrolls under the ticker,
  // then pins as a floating pill; inner pages are pinned from the start.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  useEffect(() => {
    if (!isHome) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const sentinel = sentinelRef.current;
      if (sentinel) setScrolledPast(window.scrollY >= sentinel.offsetTop);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [isHome]);
  const pinned = !isHome || scrolledPast;
  const variant = isHome ? "flush" : "floating";

  const cartLines = useCartLines();
  const bagCount = cartLines.reduce((n, l) => n + l.qty, 0);

  const isActive = (href: string | null) => Boolean(href) && routePath(href!) === pathname;

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" />
      <div className={styles.wrap} data-variant={variant} data-pinned={pinned || undefined}>
        <header className={styles.header}>
          <div className={styles.inner}>
            <Link href="/" className={styles.logo} aria-label="India Kitsch home">
              <span className={styles.logoStack}>
                {header.logo ? (
                  <Image
                    className={styles.logoImage}
                    src={header.logo.src}
                    alt={header.logo.alt || "India Kitsch"}
                    width={header.logo.width ?? 600}
                    height={header.logo.height ?? 103}
                    preload
                  />
                ) : (
                  // Text wordmark until India Kitsch has its own logo file.
                  <span className={`${styles.logoImage} ${styles.wordmark}`}>India Kitsch</span>
                )}
                {header.hindiLogo && (
                  <span className={styles.hindiLogo} lang="hi" aria-hidden="true">
                    {header.hindiLogo}
                  </span>
                )}
              </span>
            </Link>

            <nav className={styles.nav} aria-label="Main" ref={navRef}>
              <ul className={styles.navList}>
                {header.nav.map((item, i) => (
                  <li
                    key={item.label}
                    className={styles.navItem}
                    onMouseEnter={() => item.children && setOpenMenu(i)}
                    onMouseLeave={() =>
                      item.children && setOpenMenu((cur) => (cur === i ? null : cur))
                    }
                  >
                    {item.children ? (
                      <>
                        <button
                          type="button"
                          className={styles.navLink}
                          aria-expanded={openMenu === i}
                          onClick={() => setOpenMenu((cur) => (cur === i ? null : i))}
                        >
                          <span>{item.label}</span>
                          <ChevronDown className={styles.chevron} />
                        </button>
                        {openMenu === i && (
                          <div className={styles.dropdown}>
                            <ul>
                              {item.children.map((child) => (
                                <li key={child.label}>
                                  <SiteLink href={child.href} className={styles.dropdownLink}>
                                    {child.label}
                                  </SiteLink>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <SiteLink
                        href={item.href}
                        className={styles.navLink}
                        data-active={isActive(item.href) || undefined}
                        data-highlight={item.highlight || undefined}
                      >
                        {item.label}
                      </SiteLink>
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            <div className={styles.actions}>
              <SiteLink
                href={header.actions.search}
                className={`${styles.action} ${styles.desktopOnly}`}
                aria-label="Search"
              >
                <SearchIcon />
              </SiteLink>
              <SiteLink
                href={header.actions.wishlist}
                className={styles.action}
                aria-label="Wishlist"
              >
                <HeartIcon />
                {items.length > 0 && <span className={styles.count}>{items.length}</span>}
              </SiteLink>
              <button
                type="button"
                className={styles.action}
                aria-label={bagCount ? `Bag, ${bagCount} items` : "Bag"}
                onClick={openCart}
              >
                <BagIcon />
                {bagCount > 0 && <span className={styles.count}>{bagCount}</span>}
              </button>
              <SiteLink
                href={header.actions.tracking}
                className={`${styles.action} ${styles.desktopOnly}`}
                aria-label="Track order"
              >
                <BoxIcon />
              </SiteLink>
              <SiteLink
                href={header.actions.account}
                className={`${styles.action} ${styles.desktopOnly}`}
                aria-label="Account"
              >
                <UserIcon />
              </SiteLink>
              <button
                type="button"
                className={styles.menuButton}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                <MenuIcon size={22} />
              </button>
            </div>
          </div>
        </header>
      </div>
      <div
        className={styles.pinSpacer}
        data-variant={variant}
        data-pinned={pinned || undefined}
        aria-hidden="true"
      />
      <div
        className={styles.mobileSpacer}
        data-variant={isHome ? "flush" : "floating"}
        aria-hidden="true"
      />
      <MobileDrawer
        header={header}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname}
      />
    </>
  );
}
