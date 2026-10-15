/**
 * A tag as people write it, from the way notes spell it in their front
 * matter: "seconde-guerre-mondiale" → "Seconde Guerre mondiale",
 * "xxe-siècle" → "XXe siècle", "osint" → "OSINT". Display only: the slug
 * (lib/slug.ts) and so the /themes/<slug>/ URL stay as they are.
 */

/** Read as letters. */
const ACRONYMS = new Set(
  (
    "acl adcs amsi api aws crispr ctf dfir dns edr gcp http ia iam iot ipv4 " +
    "ldap lfcs lfi llm lstm mitm moc nlp ntlm osint owasp pcap php pki pnpt " +
    "raid rce smb soc ssrf tls wpa2 xml"
  ).split(" "),
);

/** Whole tags whose spelling no rule gets right (accents the notes dropped,
 *  proper nouns, a capital mid-phrase). Keys are the lower-case tag. */
const SPELLED: Record<string, string> = {
  "seconde-guerre-mondiale": "Seconde Guerre mondiale",
  "moyen-âge": "Moyen Âge",
  "lévi-strauss": "Lévi-Strauss",
  "papua-nouvelle-guinee": "Papouasie-Nouvelle-Guinée",
  "philosophie-francaise": "Philosophie française",
  devsecops: "DevSecOps",
  javascript: "JavaScript",
  nodejs: "Node.js",
  graphql: "GraphQL",
  wifi: "Wi-Fi",
  francais: "Français",
  laicite: "Laïcité",
  phenomenologie: "Phénoménologie",
  steganographie: "Stéganographie",
  secularisation: "Sécularisation",
  etiquetage: "Étiquetage",
  creole: "Créole",
};

/** "xxe", "XIXe", "ier" (a century or a rank in Roman numerals). */
const ROMAN = /^([ivxlc]+)(e|er|ème)$/i;

export function tagLabel(tag: string): string {
  const name = tag.trim();
  const spelled = SPELLED[name.toLowerCase()];
  if (spelled) return spelled;
  const words = name.split(/[-_\s]+/).filter(Boolean);
  if (!words.length) return name;
  const out = words.map((w, i) => {
    const lower = w.toLowerCase();
    if (ACRONYMS.has(lower)) return lower.toUpperCase();
    const roman = ROMAN.exec(w);
    if (roman) return roman[1].toUpperCase() + roman[2].toLowerCase();
    return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  });
  return out.join(" ");
}
