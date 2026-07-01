import { AUTHOR, ORIGINAL_AUTHOR, ORIGINAL_AUTHOR_URL } from "@/lib/site";

// Single site-wide footer, identical on the home page and note pages.
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      data-pagefind-ignore
      className="mt-10 border-t border-[#ccc] pt-4 text-small leading-relaxed text-[#555] [container-type:inline-size]"
    >
      <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-start min-[480px]:gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="h-auto w-[5.25rem] shrink-0"
          src="/images/license.png"
          alt="Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License."
          width={88}
          height={31}
        />
        <div className="space-y-1">
          <p className="m-0">
            Copyright {year} · {AUTHOR}
          </p>
          <p className="m-0">
            Unless otherwise noted, site content is licensed under a{" "}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
              Creative Commons license
            </a>
            , and the source code under the{" "}
            <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL</a>.
            Originally created by{" "}
            <a href={ORIGINAL_AUTHOR_URL}>{ORIGINAL_AUTHOR}</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}
