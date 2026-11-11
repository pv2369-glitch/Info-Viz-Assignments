import { createRowChart, attachHover, rowAt, toggleCode } from "./rowChart.js";

let chart;

export function initPhase(selector, lookups, strikes) {
  chart = createRowChart({
    selector,
    strikes,
    dimension: "phase",
    field: "p",
    labels: lookups.phase,
    unknown: lookups.unknown,
    damageLevels: lookups.damage,
    rateGroup: "envelope",
    upward: false,
    formatLabel: (label) => label,
    unknownName: "Phase not recorded",
    unknownButton: "#phase-unknown",
  });

  const { left, right, top, bottom } = chart.plot;
  const overlay = chart.svg.append("rect")
    .attr("x", left)
    .attr("width", right - left)
    .attr("y", top)
    .attr("height", bottom - top)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", (event) => toggleCode(chart, rowAt(chart, d3.pointer(event, chart.svg.node())[1])));
  attachHover(chart, overlay);
}
