import { COLORS } from "../config.js";
import { getSelection, filterSet } from "../state.js";
import { createRowChart, attachHover, rowAt } from "./rowChart.js";

let chart;

export function heightLabel(label) {
  return `${label.replace("-", "–")} ft`;
}

function selectFromBrush(event) {
  if (!event.sourceEvent) return;
  const keepUnknown = getSelection("height").includes(chart.unknownCode) ? [chart.unknownCode] : [];
  if (event.selection) {
    const [top, bottom] = event.selection;
    const inside = chart.y.domain().filter((code) => {
      const centre = chart.y(code) + chart.y.bandwidth() / 2;
      return centre >= top && centre <= bottom;
    });
    filterSet("height", [...inside, ...keepUnknown]);
  } else {
    const code = rowAt(chart, d3.pointer(event.sourceEvent, chart.svg.node())[1]);
    const known = getSelection("height").filter((c) => c !== chart.unknownCode);
    const next = known.length === 1 && known[0] === code ? [] : [code];
    filterSet("height", [...next, ...keepUnknown]);
  }
}

export function initHeight(selector, lookups, strikes) {
  chart = createRowChart({
    selector,
    strikes,
    dimension: "height",
    field: "h",
    labels: lookups.height,
    unknown: lookups.unknown,
    damageLevels: lookups.damage,
    upward: true,
    formatLabel: heightLabel,
    unknownName: "Height not recorded",
    unknownButton: "#height-unknown",
  });

  const { left, right, top, bottom } = chart.plot;
  chart.brush = d3.brushY()
    .extent([[left, top], [right, bottom]])
    .on("end", selectFromBrush);
  chart.brushLayer = chart.svg.append("g").call(chart.brush);
  chart.brushLayer.select(".selection")
    .attr("fill", COLORS.accent)
    .attr("fill-opacity", 0.08)
    .attr("stroke", COLORS.accent);
  attachHover(chart, chart.brushLayer);
}

export function updateHeight() {
  const { y } = chart;
  const known = getSelection("height").filter((c) => c !== chart.unknownCode);
  const extent = known.length ? [y(d3.max(known)), y(d3.min(known)) + y.bandwidth()] : null;
  chart.brushLayer.call(chart.brush.move, extent);
}
