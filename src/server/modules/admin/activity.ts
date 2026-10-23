import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db/client";
import {
  auditLog,
  categories,
  coupons,
  orders,
  productVariants,
  products,
  user,
} from "@/server/db/schema";
import { ADMIN_PAGE_SIZE } from "./pagination";

/**
 * Read side of `audit_log` for the admin Activity log page (docs/07 §13).
 * `writeAuditLog` (./audit.ts) stores one row per admin change with the
 * item's before/after snapshot; this lists them and works out each row's
 * item name and link. The item may since have been deleted, so names fall
 * back to the snapshot.
 */

/** The page's area tabs, each covering one or more `entity_type`s. */
export const ACTIVITY_AREAS = [
  { value: "all", label: "All", entityTypes: null },
  { value: "orders", label: "Orders", entityTypes: ["order"] },
  {
    value: "products",
    label: "Products",
    entityTypes: ["product", "product_variant", "product_image"],
  },
  { value: "inventory", label: "Inventory", entityTypes: ["inventory"] },
  { value: "categories", label: "Categories", entityTypes: ["category"] },
  { value: "coupons", label: "Coupons", entityTypes: ["coupon"] },
  { value: "customers", label: "Customers", entityTypes: ["user"] },
  { value: "settings", label: "Settings", entityTypes: ["store_settings"] },
] as const satisfies readonly {
  value: string;
  label: string;
  entityTypes: readonly string[] | null;
}[];
export type ActivityArea = (typeof ACTIVITY_AREAS)[number]["value"];

export interface ActivityFilters {
  area: ActivityArea;
  adminUserId?: string;
  from?: Date;
  to?: Date;
  dir: "asc" | "desc";
  page: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
  adminEmail: string;
}

function areaCondition(area: ActivityArea): SQL | undefined {
  const types = ACTIVITY_AREAS.find((a) => a.value === area)?.entityTypes;
  return types ? inArray(auditLog.entityType, [...types]) : undefined;
}

/** One page of entries plus per-area counts (which follow the admin and date filters). */
export async function listActivity(
  filters: ActivityFilters,
  dbHandle: DbOrTx = db,
): Promise<{ entries: ActivityEntry[]; total: number; areaCounts: Record<ActivityArea, number> }> {
  const baseConditions = [
    filters.adminUserId ? eq(auditLog.adminUserId, filters.adminUserId) : undefined,
    filters.from ? gte(auditLog.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLog.createdAt, filters.to) : undefined,
  ].filter((c) => c !== undefined);
  const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;
  const where = and(...baseConditions, areaCondition(filters.area));
  const order = filters.dir === "asc" ? asc : desc;

  const [entries, [{ total }], typeCounts] = await Promise.all([
    dbHandle
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        createdAt: auditLog.createdAt,
        adminEmail: user.email,
      })
      .from(auditLog)
      .innerJoin(user, eq(user.id, auditLog.adminUserId))
      .where(where)
      // `id` breaks ties so rows written in the same instant keep a stable order across pages.
      .orderBy(order(auditLog.createdAt), order(auditLog.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((filters.page - 1) * ADMIN_PAGE_SIZE),
    dbHandle.select({ total: count() }).from(auditLog).where(where),
    dbHandle
      .select({ entityType: auditLog.entityType, n: count() })
      .from(auditLog)
      .where(baseWhere)
      .groupBy(auditLog.entityType),
  ]);

  const areaCounts = Object.fromEntries(ACTIVITY_AREAS.map((a) => [a.value, 0])) as Record<
    ActivityArea,
    number
  >;
  for (const { entityType, n } of typeCounts) {
    areaCounts.all += n;
    const area = ACTIVITY_AREAS.find((a) => a.entityTypes?.some((t) => t === entityType));
    if (area) areaCounts[area.value] += n;
  }

  return { entries, total, areaCounts };
}

/** Admins who appear in the log, for the admin filter. */
export async function listActivityAdmins(
  dbHandle: DbOrTx = db,
): Promise<{ id: string; email: string }[]> {
  return dbHandle
    .selectDistinct({ id: user.id, email: user.email })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.adminUserId))
    .orderBy(user.email);
}

export interface ActivityItem {
  label: string;
  href: string | null;
  /** The item no longer exists; `label` came from the snapshot. */
  deleted: boolean;
}

const SETTINGS_LABELS: Record<string, string> = {
  shipping: "Shipping settings",
  storeInfo: "Store info",
  catalog: "Catalog settings",
};

function field(snapshot: unknown, key: string): unknown {
  return snapshot && typeof snapshot === "object"
    ? (snapshot as Record<string, unknown>)[key]
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * The item each entry is about, keyed by entry id, from a handful of batched
 * lookups. Also returns every category's name, which the change summaries
 * use to show a product's category instead of its id.
 */
export async function resolveActivityItems(
  entries: ActivityEntry[],
  dbHandle: DbOrTx = db,
): Promise<{ items: Map<string, ActivityItem>; categoryNames: Map<string, string> }> {
  const ids = {
    product: new Set<string>(),
    variant: new Set<string>(),
    coupon: new Set<string>(),
    user: new Set<string>(),
    order: new Set<string>(),
  };
  for (const e of entries) {
    const snapshotProductId = str(field(e.after, "productId")) ?? str(field(e.before, "productId"));
    switch (e.entityType) {
      case "product":
        ids.product.add(e.entityId);
        break;
      case "product_variant":
        ids.variant.add(e.entityId);
        if (snapshotProductId) ids.product.add(snapshotProductId);
        break;
      case "product_image":
        if (snapshotProductId) ids.product.add(snapshotProductId);
        break;
      case "inventory":
        ids.variant.add(e.entityId);
        break;
      case "coupon":
        ids.coupon.add(e.entityId);
        break;
      case "user":
        ids.user.add(e.entityId);
        break;
      case "order":
        ids.order.add(e.entityId);
        break;
    }
  }

  const none = Promise.resolve([]);
  const [productRows, variantRows, couponRows, userRows, orderRows, categoryRows] =
    await Promise.all([
      ids.product.size
        ? dbHandle
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(inArray(products.id, [...ids.product]))
        : none,
      ids.variant.size
        ? dbHandle
            .select({
              id: productVariants.id,
              productId: productVariants.productId,
              size: productVariants.size,
              color: productVariants.color,
              productName: products.name,
            })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(inArray(productVariants.id, [...ids.variant]))
        : none,
      ids.coupon.size
        ? dbHandle
            .select({ id: coupons.id, code: coupons.code })
            .from(coupons)
            .where(inArray(coupons.id, [...ids.coupon]))
        : none,
      ids.user.size
        ? dbHandle
            .select({ id: user.id, name: user.name, email: user.email })
            .from(user)
            .where(inArray(user.id, [...ids.user]))
        : none,
      ids.order.size
        ? dbHandle
            .select({ id: orders.id, orderNumber: orders.orderNumber })
            .from(orders)
            .where(inArray(orders.id, [...ids.order]))
        : none,
      // Small table; all of it, for category names in product diffs too.
      dbHandle.select({ id: categories.id, name: categories.name }).from(categories),
    ]);

  const productName = new Map(productRows.map((r) => [r.id, r.name]));
  const variant = new Map(variantRows.map((r) => [r.id, r]));
  const couponCode = new Map(couponRows.map((r) => [r.id, r.code]));
  const customer = new Map(userRows.map((r) => [r.id, r]));
  const orderNumber = new Map(orderRows.map((r) => [r.id, r.orderNumber]));
  const categoryNames = new Map(categoryRows.map((r) => [r.id, r.name]));

  const items = new Map<string, ActivityItem>();
  for (const e of entries) {
    const snapshotName = str(field(e.before, "name")) ?? str(field(e.after, "name"));
    const snapshotProductId = str(field(e.after, "productId")) ?? str(field(e.before, "productId"));
    let item: ActivityItem;
    switch (e.entityType) {
      case "product": {
        const name = productName.get(e.entityId);
        item = name
          ? { label: name, href: `/admin/products/${e.entityId}`, deleted: false }
          : { label: snapshotName ?? "Product", href: null, deleted: true };
        break;
      }
      case "product_variant":
      case "inventory": {
        const v = variant.get(e.entityId);
        if (v) {
          item = {
            label: `${v.productName} · ${v.size} / ${v.color}`,
            href:
              e.entityType === "inventory"
                ? `/admin/inventory/${v.id}`
                : `/admin/products/${v.productId}`,
            deleted: false,
          };
        } else {
          const size = str(field(e.before, "size"));
          const color = str(field(e.before, "color"));
          const parent = snapshotProductId ? productName.get(snapshotProductId) : undefined;
          const option = size && color ? `${size} / ${color}` : "Size & colour";
          item = {
            label: parent ? `${parent} · ${option}` : option,
            href: parent ? `/admin/products/${snapshotProductId}` : null,
            deleted: true,
          };
        }
        break;
      }
      case "product_image": {
        const parent = snapshotProductId ? productName.get(snapshotProductId) : undefined;
        item = parent
          ? {
              label: `Photo · ${parent}`,
              href: `/admin/products/${snapshotProductId}`,
              deleted: false,
            }
          : { label: "Photo", href: null, deleted: true };
        break;
      }
      case "category": {
        if (e.entityId === "bulk") {
          item = { label: "All categories", href: "/admin/categories", deleted: false };
          break;
        }
        const name = categoryNames.get(e.entityId);
        item = name
          ? { label: name, href: "/admin/categories", deleted: false }
          : { label: snapshotName ?? "Category", href: null, deleted: true };
        break;
      }
      case "coupon": {
        const code = couponCode.get(e.entityId);
        const snapshotCode = str(field(e.before, "code")) ?? str(field(e.after, "code"));
        item = code
          ? {
              label: code,
              href: `/admin/coupons?q=${encodeURIComponent(code)}`,
              deleted: false,
            }
          : { label: snapshotCode ?? "Coupon", href: null, deleted: true };
        break;
      }
      case "user": {
        const c = customer.get(e.entityId);
        item = c
          ? { label: c.name || c.email, href: `/admin/customers/${c.id}`, deleted: false }
          : { label: "Customer", href: null, deleted: true };
        break;
      }
      case "order": {
        const n = orderNumber.get(e.entityId);
        item =
          n !== undefined
            ? { label: `IK-${n}`, href: `/admin/orders/${e.entityId}`, deleted: false }
            : { label: "Order", href: null, deleted: true };
        break;
      }
      case "store_settings":
        item = {
          label: SETTINGS_LABELS[e.entityId] ?? e.entityId,
          href: "/admin/settings",
          deleted: false,
        };
        break;
      default:
        // A kind of change this page doesn't know yet: show it raw rather than break.
        item = { label: `${e.entityType} ${e.entityId}`, href: null, deleted: false };
    }
    items.set(e.id, item);
  }

  return { items, categoryNames };
}
