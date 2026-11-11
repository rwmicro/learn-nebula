"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CALIBRATION_KEY, calibrationSummary, parseCalibration } from "@/lib/study-tools";

/** Below the stats: how often the reader is right when they said they were
 *  sure, and when they hesitated (the "Sûr·e / J'hésite" row of a note's
 *  multiple-choice questions, public/js/study-tools.js). Nothing until a
 *  few answers carry it. */
export function Calibration() {
  const locale = useLocale();
  const [sum, setSum] = useState<ReturnType<typeof calibrationSummary> | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only storage
      setSum(calibrationSummary(parseCalibration(localStorage.getItem(CALIBRATION_KEY))));
    } catch {
      /* storage blocked */
    }
  }, []);
  if (!sum || sum.sure.n + sum.unsure.n < 5) return null;
  const pct = (b: { n: number; ok: number }) => (b.n ? Math.round((100 * b.ok) / b.n) : 0);
  return (
    <p className="progression-calibration">
      {sum.sure.n > 0 && t("study.calibSure", { pct: pct(sum.sure), n: sum.sure.n }, locale)}
      {sum.sure.n > 0 && sum.unsure.n > 0 && " "}
      {sum.unsure.n > 0 && t("study.calibUnsure", { pct: pct(sum.unsure), n: sum.unsure.n }, locale)}
      {sum.sure.n >= 5 && pct(sum.sure) < 70 && <> {t("study.calibTip", undefined, locale)}</>}
    </p>
  );
}
