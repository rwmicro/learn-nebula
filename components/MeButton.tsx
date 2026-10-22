"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { readHint } from "@/lib/account-client";
import { defaultLook, type Look } from "@/lib/avatar";

/**
 * "Moi" on a phone (app.css shows it below 640px): the round button at the
 * top right that opens /progression/. The reader's avatar once signed in
 * (the account hint this browser keeps, lib/account-client.ts), the
 * silhouette otherwise. Rendered in the site bar and the home's masthead.
 */
export function MeButton({ label }: { label: string }) {
  const [look, setLook] = useState<Look | null>(null);

  useEffect(() => {
    const fromHint = () => {
      const h = readHint();
      setLook(h.in ? (h.look ?? defaultLook()) : null);
    };
    fromHint();
    window.addEventListener("gk:account", fromHint);
    return () => window.removeEventListener("gk:account", fromHint);
  }, []);

  return (
    <a className={`site-bar-me${look ? " has-avatar" : ""}`} href="/progression/" aria-label={label} data-i18n-aria-label="siteBar.me">
      {look ? (
        <Avatar look={look} size={40} still />
      ) : (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      )}
    </a>
  );
}
