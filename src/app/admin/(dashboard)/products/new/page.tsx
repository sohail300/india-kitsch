import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { db } from "@/server/db/client";
import { categories } from "@/server/db/schema";
import { getCatalogSettings } from "@/server/modules/settings/queries";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/admin/_components/page-header";
import { ProductForm } from "../product-form";
import { ProductSetupSteps } from "../product-setup-steps";

export const metadata: Metadata = { title: "New product - India Kitsch Admin" };

export default async function NewProductPage() {
  const [allCategories, catalogSettings] = await Promise.all([
    db.query.categories.findMany({ orderBy: [asc(categories.name)] }),
    getCatalogSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" render={<Link href="/admin/products" />} className="mb-2">
          <ArrowLeftIcon /> Products
        </Button>
        <PageHeader
          title="New product"
          description="Three quick steps. Start with the details — sizes, stock and photos come next."
        />
      </div>
      <ProductSetupSteps current="details" />
      <ProductForm
        categories={allCategories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))}
        defaultGstRateBps={catalogSettings.defaultGstRateBps}
        setupMode
      />
    </div>
  );
}
