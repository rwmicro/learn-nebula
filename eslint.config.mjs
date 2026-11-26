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
      // Plain <a> between pages is the design (CLAUDE.md, Navigation): every
      // page is its own document, made instant by speculation rules and view
      // transitions, not by next/link.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // lib/ is split by where code runs (CLAUDE.md, "lib/ layout"):
  //   lib/node/    needs Node (fs, the vault) — build, server components, server/
  //   lib/client/  needs a browser (window, storage, WebGPU, hooks)
  //   lib/*        shared, runs anywhere (pure logic, formats, i18n)
  // Type-only imports cross freely; tests may wire layers together.
  {
    files: ["lib/*.{ts,tsx,js,mjs}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./node/*", "@/lib/node/*"],
              allowTypeImports: true,
              message:
                "Shared lib/ code runs anywhere: no Node-only import (move the caller to lib/node/).",
            },
            {
              group: ["./client/*", "@/lib/client/*"],
              allowTypeImports: true,
              message:
                "Shared lib/ code runs anywhere: no browser-only import (move the caller to lib/client/).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/client/**/*.{ts,tsx,js,mjs}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../node/*", "@/lib/node/*"],
              allowTypeImports: true,
              message: "Browser code can't import Node-only lib/node/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "lib/node/**/*.{ts,tsx,js,mjs}",
      "server/**/*.ts",
      "app/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../client/*",
                "../lib/client/*",
                "../../lib/client/*",
                "@/lib/client/*",
              ],
              allowTypeImports: true,
              message: "Node-side code can't import browser-only lib/client/.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
