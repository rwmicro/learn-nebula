// Netfilter as iptables uses it (IPv4). Pure data: which tables hook which
// chains, the hook priorities from the kernel's enum nf_ip_hook_priorities
// (include/uapi/linux/netfilter_ipv4.h), and the four journeys the figure plays.

export const TABLES = {
  raw: ["PREROUTING", "OUTPUT"],
  mangle: ["PREROUTING", "INPUT", "FORWARD", "OUTPUT", "POSTROUTING"],
  nat: ["PREROUTING", "INPUT", "OUTPUT", "POSTROUTING"],
  filter: ["INPUT", "FORWARD", "OUTPUT"],
};

export const PRIORITY = { raw: -300, mangle: -150, natDst: -100, filter: 0, security: 50, natSrc: 100 };

export const ADDR = { wan: "203.0.113.10", server: "192.168.1.20", laptop: "192.168.1.35", remote: "198.51.100.7" };

// The chains a filter rule can sit on: filter has no PREROUTING or POSTROUTING.
export const FILTERABLE = ["INPUT", "FORWARD", "OUTPUT"];

export const TYPES = [
  {
    name: "pour la machine",
    hops: [
      { chain: "PREROUTING", table: "nat", act: "pass" },
      { chain: "ROUTE", to: "INPUT", why: "adresse locale" },
      { chain: "INPUT", table: "filter", act: "filter" },
    ],
    end: "local",
  },
  {
    name: "redirection de port",
    hops: [
      { chain: "PREROUTING", table: "nat", act: "dnat", note: "DNAT " + ADDR.server },
      { chain: "ROUTE", to: "FORWARD", why: ADDR.server },
      { chain: "FORWARD", table: "filter", act: "filter" },
      { chain: "POSTROUTING", table: "nat", act: "pass" },
    ],
    end: "out",
  },
  {
    name: "routé du LAN",
    hops: [
      { chain: "PREROUTING", table: "nat", act: "pass" },
      { chain: "ROUTE", to: "FORWARD", why: ADDR.remote },
      { chain: "FORWARD", table: "filter", act: "filter" },
      { chain: "POSTROUTING", table: "nat", act: "snat", note: "MASQ " + ADDR.wan },
    ],
    end: "out",
  },
  {
    name: "émis localement",
    hops: [
      { chain: "OUTPUT", table: "filter", act: "filter" },
      { chain: "POSTROUTING", table: "nat", act: "pass" },
    ],
    end: "out",
  },
];

// The hops a packet really makes with one DROP rule set on `drop` (or none):
// it stops at the first filter chain that holds the rule.
export function journey(type, drop) {
  const steps = [];
  for (const hop of TYPES[type].hops) {
    const dropped = hop.act === "filter" && hop.chain === drop;
    steps.push({ ...hop, verdict: dropped ? "DROP" : "ACCEPT" });
    if (dropped) return { type, drop, steps, verdict: "DROP" };
  }
  return { type, drop, steps, verdict: "ACCEPT" };
}

export function stepText(step) {
  if (step.chain === "ROUTE") return "routage → " + step.to + " (" + step.why + ")";
  if (step.act === "filter") return "filter " + step.chain + " · " + step.verdict;
  if (step.note) return "nat " + step.chain + " · " + step.note;
  return "nat " + step.chain + " · rien";
}

export function summary(j) {
  return j.steps.filter((s) => s.chain !== "ROUTE").map((s) => s.chain).join(" → ") + " · " + j.verdict;
}
