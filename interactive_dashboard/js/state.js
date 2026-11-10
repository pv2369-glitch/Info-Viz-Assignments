import { LOW_HEIGHT_BINS } from "./config.js";

let cf;
let all;
let grand;
const dims = {};
const groups = {};
const selections = {};
const listeners = [];

function makeReducers(nGroups, heightBand) {
  const change = (p, d, sign) => {
    p.strikes += sign * d.n;
    p.damaging += sign * d.damagingN;
    p.knownDamage += sign * d.knownDamageN;
    p.cost += sign * d.c;
    p.costReports += sign * d.cn;
    p.byGroup[d.g] += sign * d.n;
    const band = heightBand[d.h];
    if (band) {
      p[band].damaging += sign * d.damagingN;
      p[band].known += sign * d.knownDamageN;
    }
    return p;
  };
  const add = (p, d) => change(p, d, 1);
  const remove = (p, d) => change(p, d, -1);
  const init = () => ({
    strikes: 0,
    damaging: 0,
    knownDamage: 0,
    cost: 0,
    costReports: 0,
    byGroup: new Array(nGroups).fill(0),
    low: { damaging: 0, known: 0 },
    high: { damaging: 0, known: 0 },
  });
  return [add, remove, init];
}

function makeCountReducers() {
  const change = (p, d, sign) => {
    p.strikes += sign * d.n;
    p.damaging += sign * d.damagingN;
    p.known += sign * d.knownDamageN;
    return p;
  };
  const add = (p, d) => change(p, d, 1);
  const remove = (p, d) => change(p, d, -1);
  const init = () => ({ strikes: 0, damaging: 0, known: 0 });
  return [add, remove, init];
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function initState(strikes, lookups) {
  const heightBand = lookups.height.map((label) => {
    if (label === lookups.unknown) return null;
    return LOW_HEIGHT_BINS.includes(label) ? "low" : "high";
  });

  cf = crossfilter(strikes);
  dims.time = cf.dimension((d) => d.t);
  dims.size = cf.dimension((d) => d.s);
  dims.year = cf.dimension((d) => d.y);
  dims.monthOfYear = cf.dimension((d) => d.mo);
  Object.keys(dims).forEach((name) => {
    groups[name] = dims[name].group().reduce(...makeCountReducers());
  });
  all = cf.groupAll().reduce(...makeReducers(lookups.species.length, heightBand));
  grand = totals();
}

export function filterSet(name, codes) {
  selections[name] = codes;
  if (codes.length === 0) {
    dims[name].filterAll();
  } else {
    const keep = new Set(codes);
    dims[name].filterFunction((v) => keep.has(v));
  }
  notify();
}

export function getSelection(name) {
  return selections[name] ?? [];
}

export function isFiltered() {
  return Object.values(selections).some((codes) => codes.length > 0);
}

export function clearAll() {
  Object.keys(selections).forEach((name) => {
    selections[name] = [];
    dims[name].filterAll();
  });
  notify();
}

export function totals() {
  const t = all.value();
  return { ...t, groupsPresent: t.byGroup.filter((n) => n > 0).length };
}

export function grandTotals() {
  return grand;
}

export function groupCounts(name, length) {
  const counts = Array.from({ length }, () => ({ strikes: 0, damaging: 0, known: 0 }));
  groups[name].all().forEach(({ key, value }) => {
    counts[key] = value;
  });
  return counts;
}

export function onChange(fn) {
  listeners.push(fn);
}
