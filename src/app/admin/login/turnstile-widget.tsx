"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          size?: "normal" | "flexible" | "compact";
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile widget (docs/04 §5, §14) - Better Auth's `captcha`
 * plugin (server/auth/config.ts) rejects `/sign-in/email` with
 * `MISSING_RESPONSE` unless this token is sent as the `x-captcha-response`
 * header, so the login form can't actually sign anyone in without
 * rendering this. Explicit `window.turnstile.render()`, not the implicit
 * `cf-turnstile` div + global-callback pattern - avoids relying on a
 * global function name that could collide, and gives a clean widget-id to
 * remove on unmount.
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
}: {
  siteKey: string;
  onVerify: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.turnstile) return;

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onVerify(token),
      "expired-callback": () => onVerify(null),
      "error-callback": () => onVerify(null),
      // "normal" (the default) is a fixed ~300px, left-aligned in whatever
      // container it's given - "flexible" stretches to match the form's
      // full width, consistent with the inputs and button around it.
      size: "flexible",
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onVerify is a stable setState setter from the caller
  }, [scriptLoaded, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onReady={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} className="w-full" />
    </>
  );
}
