"use client";

// Route error boundary for every page under the root layout: a component that
// throws no longer blanks the whole page (see components/layout/ErrorView.tsx).
import { ErrorView } from "@/components/layout/ErrorView";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
