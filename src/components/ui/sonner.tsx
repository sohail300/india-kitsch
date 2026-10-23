"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Softer richColors: light tints of the theme's own status tokens
          // instead of Sonner's saturated defaults.
          "--success-bg": "color-mix(in oklch, var(--success) 6%, white)",
          "--success-border": "color-mix(in oklch, var(--success) 18%, white)",
          "--success-text": "var(--success)",
          "--error-bg": "color-mix(in oklch, var(--destructive) 5%, white)",
          "--error-border": "color-mix(in oklch, var(--destructive) 16%, white)",
          "--error-text": "var(--destructive)",
          "--warning-bg": "color-mix(in oklch, var(--warning) 10%, white)",
          "--warning-border": "color-mix(in oklch, var(--warning) 30%, white)",
          "--warning-text": "var(--warning-foreground)",
          "--info-bg": "var(--popover)",
          "--info-border": "var(--border)",
          "--info-text": "var(--popover-foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
