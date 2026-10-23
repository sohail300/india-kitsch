"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxesIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TagsIcon,
  TicketPercentIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboardIcon },
  // Same order as the catalog itself: category → product → stock.
  { href: "/admin/categories", label: "Categories", icon: TagsIcon },
  { href: "/admin/products", label: "Products", icon: PackageIcon },
  { href: "/admin/inventory", label: "Inventory", icon: BoxesIcon },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCartIcon },
  { href: "/admin/customers", label: "Customers", icon: UsersIcon },
  { href: "/admin/coupons", label: "Coupons", icon: TicketPercentIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
  { href: "/admin/activity", label: "Activity log", icon: HistoryIcon },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className={cn("size-[18px]", isActive && "text-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
