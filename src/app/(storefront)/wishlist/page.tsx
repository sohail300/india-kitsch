import type { Metadata } from "next";
import { wishlistPage } from "@/app/(storefront)/_lib/content";
import WishlistView from "./wishlist-view";

export const metadata: Metadata = {
  title: wishlistPage.meta.title,
  description: wishlistPage.meta.description,
};

export default function WishlistPage() {
  return (
    <WishlistView
      eyebrow={wishlistPage.eyebrow}
      title={wishlistPage.title}
      introHtml={wishlistPage.introHtml}
      deviceNote={wishlistPage.deviceNote}
    />
  );
}
