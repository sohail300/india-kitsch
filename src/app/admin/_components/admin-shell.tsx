"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { LogOutIcon, MenuIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarNav } from "./sidebar-nav";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "A";
}

function AccountFooter({
  adminName,
  adminEmail,
  onSignOut,
}: {
  adminName: string;
  adminEmail: string;
  onSignOut: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // With cacheComponents, Next hides (not unmounts) this layout on navigation
  // via <Activity>, preserving state - without this reset, signing out and
  // back in again would reveal the dialog still open.
  useLayoutEffect(() => {
    return () => {
      setConfirmOpen(false);
      setSigningOut(false);
    };
  }, []);

  return (
    <div className="mt-auto flex items-center gap-3 border-t border-sidebar-border px-4 pt-4">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
          {initials(adminName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{adminName}</p>
        <p className="truncate text-xs text-muted-foreground">{adminEmail}</p>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <AlertDialogTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Sign out">
                    <LogOutIcon />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>Sign out</TooltipContent>
        </Tooltip>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to sign in again to access the admin panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await onSignOut();
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AdminShell({
  adminName,
  adminEmail,
  children,
}: {
  adminName: string;
  adminEmail: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside className="print:hidden sticky top-0 hidden h-svh w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar py-5 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            IK
          </div>
          <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
            India Kitsch
          </span>
        </Link>
        <SidebarNav />
        <AccountFooter adminName={adminName} adminEmail={adminEmail} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex items-center gap-2 px-6 py-5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              IK
            </div>
            <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
              India Kitsch
            </span>
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <AccountFooter adminName={adminName} adminEmail={adminEmail} onSignOut={handleSignOut} />
          <div className="h-4" />
        </SheetContent>
      </Sheet>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Button
          variant="outline"
          size="icon"
          className="print:hidden fixed top-4 left-4 z-40 bg-background shadow-sm lg:hidden"
          onClick={() => setMobileOpen(true)}
        >
          <MenuIcon className="size-5" />
        </Button>

        <main className="flex-1 px-4 pt-20 pb-6 sm:px-6 lg:px-8 lg:pt-6">{children}</main>
      </div>
    </div>
  );
}
