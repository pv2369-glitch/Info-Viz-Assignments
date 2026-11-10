export const FILES = {
  strikes: "data/strikes.min.csv",
  lookups: "data/lookups.json",
  airports: "data/airports.csv",
  usAtlas: "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json",
};

export const COLORS = {
  ink: "#222222",
  neutral: "#888888",
  accent: "#2166ac",
  outline: "#888888",
  unknown: "#d9d9d9",
  context: "#e3e3e3",
};

export const DAMAGE_RAMP = ["#fee6ce", "#fdae6b", "#e6550d", "#7f2704"];

export const DAMAGE_COLORS = {
  N: DAMAGE_RAMP[0],
  M: DAMAGE_RAMP[1],
  "M?": DAMAGE_RAMP[1],
  S: DAMAGE_RAMP[2],
  D: DAMAGE_RAMP[3],
  Unknown: COLORS.unknown,
};

export const TRANSITION_MS = 300;

export const LOW_HEIGHT_BINS = ["0", "1-500"];
export const HEIGHT_SPLIT_LABEL = "500 ft";
export const MIN_KNOWN_DAMAGE = 100;
export const NOT_RECORDED = "Not recorded";

export const FORMAT = {
  count: d3.format(","),
  pct: d3.format(".1%"),
  share: d3.format(".0%"),
  money: (v) => "$" + d3.format(".3~s")(v).replace("G", "B"),
};
