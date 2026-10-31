// Note pages (app/posts/[...slug]) only: never imported globally, so the bare
// element rules (h1, a, p, table…) stay off the other pages. One file per
// area, in cascade order: a later file may override an earlier one.
// Imported from here, not through CSS @import: an @import hands the files to
// Tailwind, which rewrites them (color-mix fallbacks, +11 KB).
import "./base.css";
import "./figures.css";
import "./quiz.css";
import "./reading-tools.css";
import "./note-end.css";
import "./native.css";
import "./layout.css";
import "./exercises.css";
