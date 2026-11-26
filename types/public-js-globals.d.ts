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
}
