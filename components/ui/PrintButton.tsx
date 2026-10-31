"use client";

import { t } from "@/lib/i18n";

/** "Imprimer" on the revision sheet: the browser's own print dialog, which
 *  also saves as PDF. Hidden in print (fiche.css). */
export function PrintButton() {
  return (
    <button type="button" className="fiche-print" onClick={() => window.print()} data-i18n="fiche.print">
      {t("fiche.print")}
    </button>
  );
}
