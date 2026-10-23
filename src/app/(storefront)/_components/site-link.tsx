import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { linkKind, localHref } from "@/app/(storefront)/_lib/routes";

type Props = Omit<ComponentProps<"a">, "href"> & {
  href: string | null | undefined;
  children?: ReactNode;
};

// Local pages use client-side navigation; store pages that don't exist in this
// app render as inactive links (LinkGuard swallows their clicks).
export default function SiteLink({ href, children, ...rest }: Props) {
  const kind = linkKind(href);
  if (kind === "local") {
    return (
      <Link href={localHref(href!)} {...rest}>
        {children}
      </Link>
    );
  }
  if (kind === "external") {
    const newTab = /^https?:/i.test(href!);
    return (
      <a
        href={href!}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <a href="#" data-inactive-href={href ?? undefined} aria-disabled="true" {...rest}>
      {children}
    </a>
  );
}
