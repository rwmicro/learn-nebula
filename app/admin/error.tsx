"use client";

// The admin console's own boundary, so one failing card (as on 11 Oct, when a
// changed /healthz reply crashed the page before login) shows Réessayer
// instead of an empty page.
import { ErrorView } from "@/components/layout/ErrorView";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
