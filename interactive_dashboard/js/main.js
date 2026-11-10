import { loadData } from "./data.js";
import { FORMAT } from "./config.js";

function setKpi(id, value, note) {
  const card = d3.select(`#${id}`);
  card.select(".kpi-value").text(value);
  card.select(".kpi-note").text(note ?? "");
}

async function main() {
  const data = await loadData();
  const rows = data.strikes;

  const strikes = d3.sum(rows, (d) => d.n);
  const damaging = d3.sum(rows, (d) => d.damagingN);
  const knownDamage = d3.sum(rows, (d) => d.knownDamageN);
  const cost = d3.sum(rows, (d) => d.c);
  const costReports = d3.sum(rows, (d) => d.cn);
  const groupsPresent = new Set(rows.map((d) => d.g)).size;

  setKpi("kpi-strikes", FORMAT.count(strikes));
  setKpi("kpi-damaging", FORMAT.pct(damaging / knownDamage), `of ${FORMAT.count(knownDamage)} with known damage`);
  setKpi("kpi-cost", FORMAT.money(cost), `from ${FORMAT.count(costReports)} reports`);
  setKpi("kpi-species", groupsPresent, `of ${data.lookups.species.length}`);
}

main();
