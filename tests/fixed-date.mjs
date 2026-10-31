// Preloaded into the visual build (scripts/visual.sh, NODE_OPTIONS=--import):
// pages rendered at build time print "today" (the masthead's date, Jardin's
// "mis à jour le", the footer's year), so a baseline taken on the 31st failed
// on the 1st. Time starts at VISUAL_NOW and keeps running from there, so
// timeouts and durations inside the build behave as usual.
const start = Date.parse(process.env.VISUAL_NOW ?? "");
if (!Number.isNaN(start)) {
  const RealDate = Date;
  const offset = start - RealDate.now();
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  // Own copies of Date.UTC, Date.parse…: Next's prerender sandbox copies the
  // global's own properties, not what the class inherits.
  for (const k of ["UTC", "parse"]) FixedDate[k] = RealDate[k];
  globalThis.Date = FixedDate;
}
