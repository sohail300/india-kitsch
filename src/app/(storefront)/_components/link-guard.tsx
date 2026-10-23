"use client";

import { useEffect } from "react";
import { linkKind } from "@/app/(storefront)/_lib/routes";

// Blocks navigation for links to store pages this app doesn't have, including
// links inside CMS rich text (policies, FAQ answers).
export default function LinkGuard() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.hasAttribute("data-inactive-href")) {
        event.preventDefault();
        return;
      }
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("/") && !href.startsWith("//") && linkKind(href) === "inactive")
        event.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
