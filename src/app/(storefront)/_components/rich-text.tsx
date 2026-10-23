import type { ElementType } from "react";

type Props = { html: string; as?: ElementType; className?: string };

// Renders CMS HTML extracted from the store (sanitised to tags + href/style).
export default function RichText({ html, as: Tag = "div", className }: Props) {
  if (!html) return null;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
