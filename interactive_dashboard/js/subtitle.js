import { FORMAT, HEIGHT_SPLIT_LABEL, MIN_KNOWN_DAMAGE } from "./config.js";
import { getSelection } from "./state.js";

const yearRange = (labels) => (labels.length > 1 ? `${labels[0]}–${labels[labels.length - 1]}` : labels[0]);

const heightRange = (labels) => {
  const pretty = labels.map((label) => label.replace("-", "–"));
  return pretty.length > 1 ? `${pretty[0]} to ${pretty[pretty.length - 1]} ft` : `${pretty[0]} ft`;
};

const DESCRIBERS = {
  year: { labels: "years", format: yearRange },
  monthOfYear: { labels: "monthNames", format: (labels) => labels.join(", ") },
  height: { labels: "height", format: heightRange, missing: "height not recorded" },
  phase: { labels: "phase", format: (labels) => labels.join(" or "), missing: "phase not recorded" },
  species: { labels: "species", format: (labels) => labels.join(" or ") },
  time: { labels: "time", format: (labels) => labels.join(" or "), missing: "time not recorded" },
  size: { labels: "size", format: (labels) => `${labels.join(" or ")} animals`, missing: "animal size not recorded" },
};

function describe(spec, labels, unknown) {
  const known = labels.filter((label) => label !== unknown);
  const parts = [];
  if (known.length) parts.push(spec.format(known));
  if (known.length < labels.length) parts.push(spec.missing);
  return parts.join(" or ");
}

function describeSelection(lookups) {
  return Object.entries(DESCRIBERS)
    .map(([name, spec]) => {
      const codes = [...getSelection(name)].sort((a, b) => a - b);
      return codes.length ? describe(spec, codes.map((c) => lookups[spec.labels][c]), lookups.unknown) : null;
    })
    .filter(Boolean);
}

function claimText(t) {
  if (t.low.known < MIN_KNOWN_DAMAGE || t.high.known < MIN_KNOWN_DAMAGE) {
    return "Small sample: too few strikes with known height and damage to compare low and high strikes.";
  }
  const high = t.high.damaging / t.high.known;
  const low = t.low.damaging / t.low.known;
  const numbers = `${FORMAT.pct(high)} of strikes above ${HEIGHT_SPLIT_LABEL} were damaging vs ${FORMAT.pct(low)} at or below`;
  if (high > low) return `Higher strikes do more damage: ${numbers}.`;
  return `In this selection, higher strikes are not more damaging: ${numbers}.`;
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function renderSubtitle(lookups, t, grand) {
  const parts = describeSelection(lookups);
  const firstYear = lookups.months[0].slice(0, 4);
  const lastYear = lookups.months[lookups.months.length - 1].slice(0, 4);
  const scope = parts.length
    ? `${capitalise(parts.join(" · "))}: ${FORMAT.count(t.strikes)} of ${FORMAT.count(grand.strikes)} strikes`
    : `All ${FORMAT.count(grand.strikes)} strikes at US airports, ${firstYear}–${lastYear}`;
  d3.select("#subtitle").text(`${scope}. ${claimText(t)}`);
}
