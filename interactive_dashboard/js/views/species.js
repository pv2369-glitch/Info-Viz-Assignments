import { SPECIES_TAIL } from "../config.js";
import { createRowChart, attachHover, rowAt, toggleCode } from "./rowChart.js";

export function initSpecies(selector, lookups, strikes) {
  const chart = createRowChart({
    selector,
    strikes,
    dimension: "species",
    field: "g",
    labels: lookups.species,
    damageLevels: lookups.damage,
    rateGroup: "species",
    rateMark: "dot",
    rateMax: 1,
    upward: false,
    fit: true,
    labelWidth: 112,
    dividerBefore: SPECIES_TAIL.find((label) => lookups.species.includes(label)),
    formatLabel: (label) => label,
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
