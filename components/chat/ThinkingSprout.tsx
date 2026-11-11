/** While the assistant searches and writes (GardenChat's status line): a
 *  sprout comes up, opens two leaves and a tulip bud, then starts again
 *  (chat.css `.gc-sprout`). Still, fully grown, when motion is reduced. */
export function ThinkingSprout() {
  return (
    <svg
      className="gc-sprout"
      viewBox="0 0 24 28"
      width="24"
      height="28"
      aria-hidden="true"
    >
      <path className="gc-sprout-soil" d="M3 26h18" />
      <path className="gc-sprout-stem" d="M12 26V10" pathLength={1} />
      <path
        className="gc-sprout-lf gc-sprout-lf--l"
        d="M12 20q-6.5 0-7.5-6q6.5 0 7.5 6z"
      />
      <path
        className="gc-sprout-lf gc-sprout-lf--r"
        d="M12 16.5q6.5 0 7.5-6q-6.5 0-7.5 6z"
      />
      <path
        className="gc-sprout-bud"
        d="M9 4q0 6.5 3 6.5t3-6.5l-1.5 2L12 2.5 10.5 6z"
      />
    </svg>
  );
}
