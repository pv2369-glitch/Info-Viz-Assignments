import { loadData } from "./data.js";
import { FORMAT } from "./config.js";
import { initState, onChange, totals, grandTotals, isFiltered, clearAll, getSelection } from "./state.js";
import { initChips } from "./chips.js";
import { renderSubtitle } from "./subtitle.js";
import { initTimeline, updateTimeline } from "./views/timeline.js";
import { initHeight, updateHeight } from "./views/height.js";
import { initPhase } from "./views/phase.js";
import { initSpecies } from "./views/species.js";
import { initMap, updateMap, resetZoom, isZoomed } from "./views/map.js";
import { updateRowCharts } from "./views/rowChart.js";
import { renderRowLegend } from "./legend.js";
import { renderKey } from "./key.js";
import { initAbout } from "./about.js";

function setKpi(id, value, note) {
  const card = d3.select(`#${id}`);
  card.select(".kpi-value").text(value);
  card.select(".kpi-note").text(note ?? "");
}

function unknownShare(strikes, field, labels, unknown) {
  const code = labels.indexOf(unknown);
  const missing = d3.sum(strikes, (d) => (d[field] === code ? d.n : 0));
  return missing / d3.sum(strikes, (d) => d.n);
}

function renderKpis(t, grand, nGroups) {
  const pct = t.knownDamage > 0 ? FORMAT.pct(t.damaging / t.knownDamage) : "–";
  const share = isFiltered() ? `${FORMAT.pct(t.strikes / grand.strikes)} of all strikes` : "";
  const coverage = t.strikes > 0 ? ` (${FORMAT.pct(t.costReports / t.strikes)} of strikes)` : "";

  setKpi("kpi-strikes", FORMAT.count(t.strikes), share);
  setKpi("kpi-damaging", pct, `of ${FORMAT.count(t.knownDamage)} with known damage`);
  setKpi("kpi-cost", FORMAT.money(t.cost), `from ${FORMAT.count(t.costReports)} reports${coverage}`);
  setKpi("kpi-species", t.groupsPresent, `of ${nGroups}`);
}

async function main() {
  const data = await loadData();
  const { lookups } = data;
  const nGroups = lookups.species.length;

  initState(data.strikes, lookups);
  const { strikes } = data;
  initChips("chips-time", lookups.time, "time", lookups.unknown, unknownShare(strikes, "t", lookups.time, lookups.unknown));
  initChips("chips-size", lookups.size, "size", lookups.unknown, unknownShare(strikes, "s", lookups.size, lookups.unknown));
  d3.select("#reset").on("click", () => {
    clearAll();
    resetZoom();
  });

  const renderText = () => {
    const t = totals();
    const grand = grandTotals();
    renderKpis(t, grand, nGroups);
    renderSubtitle(lookups, t, grand);
    d3.select("#reset").property("disabled", !isFiltered() && !isZoomed());
  };
  renderText();
  initAbout(data, grandTotals());
  renderRowLegend("#legend-damage");

  initHeight("#chart-height", lookups, data.strikes);
  initPhase("#chart-phase", lookups, data.strikes);
  initMap("#chart-map", "#legend-map", data);
  initTimeline("#chart-timeline", lookups, data.strikes);
  initSpecies("#chart-species", lookups, data.strikes);

  const render = () => {
    renderText();
    updateTimeline();
    updateMap();
    updateRowCharts();
    updateHeight();
    renderKey("#key-envelope", ["height", "phase"].some((name) => getSelection(name).length > 0));
  };
  onChange(render);
  render();
}

function finishLoading() {
  const dashboard = document.querySelector(".dashboard");
  dashboard.classList.remove("is-loading");
  dashboard.setAttribute("aria-busy", "false");
}

function showLoadError(error) {
  console.error(error);
  document.documentElement.classList.add("load-failed");
  document.querySelector("#load-error-detail").textContent = `Details: ${error.message}`;
  finishLoading();
}

main().then(finishLoading, showLoadError);
