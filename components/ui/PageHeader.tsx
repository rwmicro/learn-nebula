import type { ReactNode } from "react";
import { AppBack } from "@/components/AppBack";

// The top of a page: the phone's "‹ Notes" back link, an optional kicker, the
// <h1> and its intro. The look is global.css's .page-title / .page-intro (the
// --title-page token), so a new page gets the same title as the others with
// no CSS of its own; `name` adds the page's <name>-title / <name>-intro for
// what is really its own (a margin, a max-width). A fragment, not a <header>:
// app.css places these children with `main > …` selectors.
export function PageHeader({
  name,
  back,
  kicker,
  title,
  titleProps,
  intro,
  introProps,
}: {
  name?: string;
  back?: { href: string; labelKey: string };
  kicker?: ReactNode;
  title: ReactNode;
  /** i18nProps(key) for the runtime language swap. */
  titleProps?: Record<string, string>;
  intro?: ReactNode;
  introProps?: Record<string, string>;
}) {
  const cls = (part: string) => (name ? `page-${part} ${name}-${part}` : `page-${part}`);
  return (
    <>
      {back && <AppBack href={back.href} labelKey={back.labelKey} />}
      {kicker}
      <h1 className={cls("title")} {...titleProps}>
        {title}
      </h1>
      {intro != null && (
        <p className={cls("intro")} {...introProps}>
          {intro}
        </p>
      )}
    </>
  );
}
