// Like shared.tsx's adminFetch, but a non-2xx answer still hands back its
// JSON body — the admin tool routes (server/routes/admin-tools.ts) put the
// reason in `error` ("GITHUB_TOKEN n'est pas défini", "HTTP 403 — …"), and
// those cards show it rather than a bare status code. 401 still throws
// Unauthorized so the panel can disconnect.

import { Unauthorized } from "./shared";

export interface AdminAnswer<T> {
  ok: boolean;
  status: number;
  data: (T & { error?: string }) | null;
}

export async function adminJson<T>(url: string, token: string, init: RequestInit = {}): Promise<AdminAnswer<T>> {
  const r = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  });
  if (r.status === 401) throw new Unauthorized();
  let data: (T & { error?: string }) | null = null;
  try {
    data = (await r.json()) as T & { error?: string };
  } catch {
    /* empty or non-JSON body */
  }
  return { ok: r.ok, status: r.status, data };
}

/** The server's message, or a generic one naming the status. */
export function answerError(a: AdminAnswer<unknown>, fallback: string): string {
  return a.data?.error || `${fallback} (HTTP ${a.status})`;
}
