// Globals the vanilla note scripts (public/js/*.js) share through `window`.
// Only for tsconfig.public-js.json: the app declares its own, typed, next to
// the code that owns each one (LangSwitcher, AppSettings…), so this file is
// excluded from the root tsconfig to keep the two from clashing.
export {};

declare global {
  interface Window {
    __i18n: any;
    __theme: any;
    __palette: any;
    __gkReadAloud: any;
    __gkTranslateDevice: any;
    __gkPiper: any;
    __gkAudioCtx: any;
    __gkReportError: any;
    turnstile: any;
    mermaid: any;
    Translator: any;
    webkitAudioContext: any;
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }

  // The note scripts query HTML they wrote themselves: a selector string
  // gives an HTMLElement here (the DOM lib says Element), so `.hidden`,
  // `.dataset` and `.focus()` need no cast. A tag name keeps its own type.
  interface ParentNode {
    querySelector<K extends keyof HTMLElementTagNameMap>(selectors: K): HTMLElementTagNameMap[K] | null;
    querySelector<K extends keyof SVGElementTagNameMap>(selectors: K): SVGElementTagNameMap[K] | null;
    querySelector<E extends Element = HTMLElement>(selectors: string): E | null;
    querySelectorAll<K extends keyof HTMLElementTagNameMap>(selectors: K): NodeListOf<HTMLElementTagNameMap[K]>;
    querySelectorAll<K extends keyof SVGElementTagNameMap>(selectors: K): NodeListOf<SVGElementTagNameMap[K]>;
    querySelectorAll<E extends Element = HTMLElement>(selectors: string): NodeListOf<E>;
  }
  interface Element {
    closest<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K] | null;
    closest<E extends Element = HTMLElement>(selectors: string): E | null;
  }
}
