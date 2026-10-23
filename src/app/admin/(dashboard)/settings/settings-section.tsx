import type { ComponentType, ReactNode } from "react";

/**
 * A cardless settings-row layout: icon/title/description on top, fields
 * below, both full-width - the whole settings page is a `divide-y` list of
 * these instead of a grid of boxed cards.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  lastUpdated,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Pre-formatted "by <email> · <date>", from the audit log; omitted if never saved. */
  lastUpdated?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-8 first:pt-0">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="font-medium text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {lastUpdated ? (
            <p className="mt-1 text-xs text-muted-foreground">Last updated {lastUpdated}</p>
          ) : null}
        </div>
      </div>
      <div className="max-w-lg">{children}</div>
    </div>
  );
}
