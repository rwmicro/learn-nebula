// Continents of the UN geoscheme (M49), by ISO alpha-2 code, for the
// "Par région" view of /carte/. Antarctica and anything unlisted have none.
const REGIONS = {
  africa:
    "DZ EG LY MA SD TN EH IO BI KM DJ ER ET TF KE MG MW MU YT MZ RE RW SC SO SS UG TZ ZM ZW AO CM CF TD CG CD GQ GA ST BW SZ LS NA ZA BJ BF CV CI GM GH GN GW LR ML MR NE NG SH SN SL TG",
  americas:
    "AI AG AR AW BS BB BZ BM BO BQ BV BR CA KY CL CO CR CU CW DM DO EC SV FK GF GL GD GP GT GY HT HN JM MQ MX MS NI PA PY PE PR BL KN LC MF PM VC SX GS SR TT TC US UM UY VE VG VI",
  asia:
    "AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KP KR KW KG LA LB MO MY MV MN MM NP OM PK PS PH QA SA SG LK SY TW TJ TH TL TR TM AE UZ VN YE",
  europe:
    "AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG VA HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB",
  oceania: "AS AU CX CC CK FJ PF GU HM KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF",
} as const;

export type Region = keyof typeof REGIONS;
export const REGION_ORDER = Object.keys(REGIONS) as Region[];

const BY_ISO2 = new Map<string, Region>(
  REGION_ORDER.flatMap((r) => REGIONS[r].split(" ").map((c) => [c, r] as [string, Region])),
);

export function regionOf(iso2: string): Region | null {
  return BY_ISO2.get(iso2.toUpperCase()) ?? null;
}
