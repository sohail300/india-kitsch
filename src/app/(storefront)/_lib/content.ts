// Content shapes for the storefront UI. Values currently come from the
// `_placeholder/` files; swap these exports for catalog/settings queries
// once the storefront is wired to the backend (docs/10 Phase 10).
import type { StaticImageData } from "next/image";
import {
  blog as placeholderBlog,
  collection as placeholderCollection,
  products,
  search as placeholderSearch,
  wishlistPage as placeholderWishlistPage,
} from "../_placeholder/catalog";
import { home as placeholderHome, shell as placeholderShell } from "../_placeholder/content";
import {
  contact as placeholderContact,
  faq as placeholderFaq,
  policies as placeholderPolicies,
  story as placeholderStory,
} from "../_placeholder/info-pages";

export type Img = {
  src: StaticImageData | string;
  alt: string;
  width: number | null;
  height: number | null;
};
export type NavLink = { label: string; href: string };

export type Product = {
  handle: string;
  url: string;
  productId: string | null;
  variantId: string | null;
  title: string;
  fullTitle: string | null;
  variantTitle: string | null;
  price: string;
  priceCents: number | null;
  compareAtPrice?: string | null;
  badge?: string | null;
  label?: string | null;
  lowStock?: string | null;
  soldOut: boolean;
  images: Img[];
};

export type NavItem = {
  label: string;
  href: string | null;
  highlight?: boolean;
  children?: NavLink[];
};

export type Shell = {
  announcement: { heading: string; endsAt: string | null; ticker: string[] };
  header: {
    logo: Img | null;
    hindiLogo: string;
    caption: string;
    nav: NavItem[];
    actions: { search: string; wishlist: string; cart: string; tracking: string; account: string };
    drawer: {
      eyebrow: string;
      subtitle: string;
      searchPlaceholder: string;
      sectionLabels: string[];
      support: { title: string; subtitle: string; href: string }[];
      submenus: {
        label: string;
        sectionLabel: string;
        viewAll: { title: string; subtitle: string; href: string };
        items: { title: string; subtitle: string | null; href: string }[];
      }[];
    };
  };
  footer: {
    eyebrow: string;
    heading: string;
    cta: NavLink;
    logo: Img | null;
    follow: {
      eyebrow: string;
      heading: string;
      html: string;
      links: { href: string; network: "instagram" | "facebook"; lines: string[] }[];
    };
    columns: (
      | { heading: string; type: "links"; links: NavLink[] }
      | {
          heading: string;
          type: "contact";
          links: { href: string; parts: string[] }[];
          static: string[];
        }
      | { heading: string; type: "html"; html: string }
    )[];
    payments: { label: string; cards: { name: string; image: Img | null; svg: string | null }[] };
    signature: string;
    legal: {
      brand: string;
      ownership: string;
      company: string;
      copyright: string;
      links: NavLink[];
    };
  };
};

export type HomeContent = {
  slides: {
    href: string;
    label: string;
    desktop: Img;
    mobile: { src: StaticImageData | string } | null;
  }[];
  seoHeading: string;
  fabric: {
    eyebrow: string;
    heading: string;
    cards: { title: string; href: string; image: Img }[];
  };
  mostLoved: { heading: string; products: string[] };
  trust: { icon: "leaf" | "return" | "lock"; title: string; text: string; mobileLabel: string }[];
  newEdit: { heading: string; products: string[] };
  reels: {
    heading: string;
    items: { poster: StaticImageData | string; video: string | null; label: string }[];
  };
  signature: { heading: string; products: string[] };
  editorial: { words: { text: string; outline: boolean }[]; label: string; model: Img | null };
};

export type PageMeta = { title: string; description: string };

export type ListingContent = { meta: PageMeta; products: string[] };

export type Article = {
  featured: boolean;
  title: string;
  href: string;
  date: string;
  datetime: string | null;
  excerpt: string;
  readLabel: string;
  image: Img | null;
};

export type BlogContent = {
  meta: PageMeta;
  eyebrow: string;
  title: string;
  intro: string;
  articles: Article[];
};

export type WishlistPageContent = {
  meta: PageMeta;
  eyebrow: string;
  title: string;
  introHtml: string;
  deviceNote: string;
};

export type StoryContent = {
  meta: PageMeta;
  hero: {
    eyebrow: string;
    titleHtml: string;
    html: string;
    meta: string[];
    image: Img;
    caption: string;
  };
  chapters: {
    index: string;
    offset: boolean;
    eyebrow: string;
    titleHtml: string;
    html: string;
    aside: { eyebrow: string; line: string; html: string } | null;
  }[];
  principles: {
    number: string;
    eyebrow: string;
    title: string;
    items: { number: string; title: string; html: string }[];
  };
  philosophy: { eyebrow: string; quoteHtml: string };
  closing: { eyebrow: string; title: string; html: string; links: NavLink[] };
};

export type FaqContent = {
  meta: PageMeta;
  eyebrow: string;
  heading: string;
  introHtml: string;
  identityHtml: string;
  categories: {
    title: string;
    description: string;
    items: { question: string; html: string }[];
  }[];
};

export type ContactContent = {
  meta: PageMeta;
  eyebrow: string;
  heading: string;
  descriptionHtml: string;
  supportHtml: string;
  details: { label: string; html: string }[];
};

export type PolicyHandle =
  "shipping-policy" | "refund-policy" | "privacy-policy" | "terms-of-service";
export type PolicyContent = { meta: PageMeta; title: string; html: string };

export const shell: Shell = placeholderShell;
export const home: HomeContent = placeholderHome;
export const collection = placeholderCollection;
export const search = placeholderSearch;
export const blog: BlogContent = placeholderBlog;
export const wishlistPage: WishlistPageContent = placeholderWishlistPage;
export const story: StoryContent = placeholderStory;
export const faq: FaqContent = placeholderFaq;
export const contact: ContactContent = placeholderContact;
export const policies: Record<PolicyHandle, PolicyContent> = placeholderPolicies;

export function getProducts(handles: string[]): Product[] {
  return handles.map((h) => products[h]).filter((p): p is Product => Boolean(p));
}

// Bag lines store only variant ids; this resolves them for display.
export function getProductByVariant(variantId: string): Product | undefined {
  return Object.values(products).find((p) => p.variantId === variantId);
}

// Plain URL for places that can't take StaticImageData (e.g. <source srcSet>).
export const srcOf = (src: StaticImageData | string) => (typeof src === "string" ? src : src.src);
