import { AUTHOR, ORIGINAL_AUTHOR, ORIGINAL_AUTHOR_URL } from "@/lib/site";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer data-pagefind-ignore>
      <p>
        Copyright {year} · {AUTHOR}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/license.png"
        alt="Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License."
        width={88}
        height={31}
      />
      <p>
        {" "}
        Unless otherwise noted, site content is licensed under a{" "}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">Creative Commons license</a>,
        and the source code under the{" "}
        <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL</a>. Originally created by{" "}
        <a href={ORIGINAL_AUTHOR_URL}>{ORIGINAL_AUTHOR}</a>.
      </p>
    </footer>
  );
}
