import next from "eslint-config-next";

/**
 * Flat ESLint config (Next 16). `eslint-config-next` already bundles the Next,
 * React, React-Hooks, TypeScript, import and jsx-a11y rule sets, so we just
 * spread it and scope what gets linted.
 *
 * Linted: app/, components/, lib/ (the TS/TSX source). Ignored: build output,
 * generated indexes, vendored/bundled browser scripts, Node build scripts and
 * the unrelated Obsidian plugin sub-project.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "pagefind/**",
      "public/**",
      "scripts/**",
      "content/**",
      "obsidian-manim-plugin/**",
      "schema/**",
    ],
  },
  ...next,
  {
    rules: {
      // Several client components intentionally sync state on mount — client-only
      // date formatting, sessionStorage restore — or subscribe to an external
      // store (the window.__i18n locale + the `i18n:change` event). In a static
      // export that's the correct way to avoid SSR hydration mismatches, so this
      // rule fires false positives here. Keep it visible as a warning rather than
      // contort working, hydration-sensitive code.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
