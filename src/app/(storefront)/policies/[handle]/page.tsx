import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RichText from "@/app/(storefront)/_components/rich-text";
import { policies, type PolicyHandle } from "@/app/(storefront)/_lib/content";
import styles from "./policy.module.css";

type Params = { params: Promise<{ handle: string }> };

const isPolicy = (handle: string): handle is PolicyHandle => handle in policies;

export function generateStaticParams() {
  return Object.keys(policies).map((handle) => ({ handle }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  if (!isPolicy(handle)) return {};
  return { title: policies[handle].meta.title, description: policies[handle].meta.description };
}

export default async function PolicyPage({ params }: Params) {
  const { handle } = await params;
  if (!isPolicy(handle)) notFound();
  const policy = policies[handle];
  return (
    <div className={styles.container}>
      <div className={styles.title}>
        <h1>{policy.title}</h1>
      </div>
      <RichText html={policy.html} className={styles.body} />
    </div>
  );
}
