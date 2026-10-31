// The phone "app" layer, loaded site-wide (app/layout.tsx); nearly all of it
// lives under 640px. One file per area, in cascade order: a later file may
// override an earlier one, and this layer overrides the per-page CSS.
// Imported from here, not through CSS @import: an @import hands the files to
// Tailwind, which rewrites them (color-mix fallbacks, +11 KB).
import "./base.css";
import "./tabbar.css";
import "./titles.css";
import "./home.css";
import "./note.css";
import "./parcours.css";
import "./tables.css";
import "./moi.css";
import "./note-toc.css";
import "./review.css";
import "./cartes.css";
import "./path.css";
import "./sub-pages.css";
import "./index-pages.css";
