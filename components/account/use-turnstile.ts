"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      getResponse: (id?: string) => string | undefined;
      reset: (id?: string) => void;
    };
  }
}

/** The Cloudflare Turnstile widget of the login form, when the server asks
 *  for one: `box` is the element it renders into (keep it mounted), `token()`
 *  its current answer ("" without a widget), `reset()` after each request. */
export function useTurnstile(siteKey: string | undefined) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const render = () => {
      if (window.turnstile && box.current && widget.current == null) {
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          size: "flexible",
          theme: "auto",
        });
      }
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, [siteKey]);

  return {
    box,
    token: () => (window.turnstile && widget.current != null ? (window.turnstile.getResponse(widget.current) ?? "") : ""),
    reset: () => {
      if (window.turnstile && widget.current != null) window.turnstile.reset(widget.current);
    },
  };
}

/** `?next=/admin/` on /compte/: where the e-mailed link brings the reader. */
export function nextParam(): string | undefined {
  const next = new URLSearchParams(location.search).get("next");
  return next && /^\/(?!\/)/.test(next) ? next : undefined;
}
