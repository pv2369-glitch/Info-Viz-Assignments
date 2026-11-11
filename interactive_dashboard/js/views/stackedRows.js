import { COLORS, DAMAGE_COLORS, DAMAGE_STACK, PALE_DAMAGE, FORMAT, TRANSITION_MS } from "../config.js";
import { groupCounts, getSelection, filterSet, isFilteredExcept } from "../state.js";
import { showTooltip, hideTooltip, damageLine } from "../tooltip.js";

const MARGIN = { top: 16, right: 50, bottom: 22, left: 78 };

function stackSegments(chart, counts) {
  let start = 0;
  return DAMAGE_STACK.map((code) => {
    const n = counts.byDamage[chart.damageIndex[code]];
    const segment = { code, start, n };
    start += n;
    return segment;
  });
}

export function rowAt(chart, py) {
  const { y } = chart;
  const i = Math.floor((py - y.range()[0]) / y.step());
  return y.domain()[Math.max(0, Math.min(y.domain().length - 1, i))];
}

function tooltipHtml(chart, code, px) {
  const counts = chart.current[code];
  const lines = [
    `<strong>${chart.formatLabel(chart.labels[code])}</strong>`,
    `${FORMAT.count(counts.strikes)} strikes${isFilteredExcept(chart.dimension) ? " matching the other filters" : ""}`,
    damageLine(counts),
  ];
  const value = chart.x.invert(px);
  const segment = stackSegments(chart, counts).find((s) => value >= s.start && value < s.start + s.n);
  if (segment && counts.strikes > 0) {
    const level = chart.damageLabels[segment.code];
    lines.push(`${level}: ${FORMAT.count(segment.n)} (${FORMAT.pct(segment.n / counts.strikes)} of ${chart.rowNoun})`);
  }
  return lines.join("<br>");
}

export function attachHover(chart, target) {
  target
    .on("mousemove.tip", (event) => {
      const [px, py] = d3.pointer(event, chart.svg.node());
      const code = rowAt(chart, py);
      chart.highlight.attr("y", chart.y(code)).attr("visibility", "visible");
      showTooltip(tooltipHtml(chart, code, px), event);
    })
    .on("mouseleave.tip", () => {
      chart.highlight.attr("visibility", "hidden");
      hideTooltip();
    });
}

export function toggleCode(chart, code) {
  const selected = new Set(getSelection(chart.dimension));
  if (selected.has(code)) {
    selected.delete(code);
  } else {
    selected.add(code);
  }
  filterSet(chart.dimension, [...selected]);
}

export function createStackedRows(spec) {
  const container = document.querySelector(spec.selector);
  const { width, height } = container.getBoundingClientRect();
  const plotBottom = height - MARGIN.bottom;
  const unknownCode = spec.labels.indexOf(spec.unknown);
  const knownCodes = spec.labels.map((label, code) => code).filter((code) => code !== unknownCode);
  const hatchId = `hatch-${spec.dimension}`;

  const allTotals = new Array(spec.labels.length).fill(0);
  spec.strikes.forEach((d) => {
    allTotals[d[spec.field]] += d.n;
  });

  const y = d3.scaleBand()
    .domain(spec.upward ? [...knownCodes].reverse() : knownCodes)
    .range([MARGIN.top, plotBottom])
    .padding(0.2);
  const x = d3.scaleLinear()
    .domain([0, d3.max(knownCodes, (code) => allTotals[code])])
    .nice()
    .range([MARGIN.left, width - MARGIN.right]);

  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const pattern = svg.append("defs")
    .append("pattern")
    .attr("id", hatchId)
    .attr("width", 4)
    .attr("height", 4)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)");
  pattern.append("rect").attr("width", 4).attr("height", 4).attr("fill", "#ffffff");
  pattern.append("line").attr("y2", 4).attr("stroke", COLORS.neutral).attr("stroke-width", 1.5);

  svg.append("g")
    .attr("transform", `translate(0,${plotBottom})`)
    .call(d3.axisBottom(x).ticks(3).tickFormat(d3.format("~s")).tickSizeOuter(0));
  svg.append("text")
    .attr("x", width - 2)
    .attr("y", plotBottom + 16)
    .attr("text-anchor", "end")
    .attr("font-size", 10)
    .attr("fill", COLORS.ink)
    .text("strikes");

  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).tickFormat((code) => spec.formatLabel(spec.labels[code])).tickSizeOuter(0));

  svg.append("text")
    .attr("x", width - 2)
    .attr("y", MARGIN.top - 5)
    .attr("text-anchor", "end")
    .attr("font-size", 10)
    .attr("fill", COLORS.ink)
    .text("% damaging");

  const rows = svg.append("g")
    .selectAll("g")
    .data(knownCodes)
    .join("g")
    .attr("transform", (code) => `translate(0,${y(code)})`);

  rows.append("rect")
    .attr("x", x(0))
    .attr("width", (code) => x(allTotals[code]) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", COLORS.context)
    .attr("stroke", COLORS.outline);
  rows.append("g").attr("class", "segments");
  rows.append("rect")
    .attr("class", "selected-outline")
    .attr("x", x(0))
    .attr("width", (code) => x(allTotals[code]) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", "none")
    .attr("stroke", COLORS.ink)
    .attr("stroke-width", 1.5)
    .attr("visibility", "hidden");
  rows.append("rect")
    .attr("class", "marker")
    .attr("x", 2)
    .attr("width", 5)
    .attr("height", y.bandwidth())
    .attr("fill", COLORS.accent)
    .attr("visibility", "hidden");
  rows.append("text")
    .attr("class", "rate")
    .attr("x", width - 2)
    .attr("y", y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("font-size", 11)
    .attr("fill", COLORS.ink);

  const highlight = svg.append("rect")
    .attr("x", x(0))
    .attr("width", x.range()[1] - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", "none")
    .attr("stroke", COLORS.ink)
    .attr("stroke-dasharray", "4 3")
    .attr("pointer-events", "none")
    .attr("visibility", "hidden");

  const chart = {
    svg, x, y, rows, highlight, unknownCode, hatchId,
    dimension: spec.dimension,
    labels: spec.labels,
    formatLabel: spec.formatLabel,
    rowNoun: spec.rowNoun,
    unknownName: spec.unknownName,
    damageIndex: Object.fromEntries(spec.damageLevels.map((level, i) => [level.code, i])),
    damageLabels: Object.fromEntries(spec.damageLevels.map((level) => [level.code, level.label])),
    current: groupCounts(spec.dimension, spec.labels.length),
  };

  chart.unknownButton = d3.select(spec.unknownButton)
    .on("click", () => toggleCode(chart, unknownCode))
    .on("mouseenter", (event) => {
      const counts = chart.current[unknownCode];
      showTooltip(`<strong>${spec.unknownName}</strong><br>${FORMAT.count(counts.strikes)} strikes<br>${damageLine(counts)}`, event);
    })
    .on("mouseleave", hideTooltip);

  return chart;
}

export function updateStackedRows(chart) {
  const { x, y, rows } = chart;
  chart.current = groupCounts(chart.dimension, chart.labels.length);
  const selected = getSelection(chart.dimension);

  rows.each(function (code) {
    d3.select(this).select(".segments")
      .selectAll("rect")
      .data(stackSegments(chart, chart.current[code]), (s) => s.code)
      .join("rect")
      .attr("y", 0)
      .attr("height", y.bandwidth())
      .attr("fill", (s) => (s.code === "Unknown" ? `url(#${chart.hatchId})` : DAMAGE_COLORS[s.code]))
      .attr("stroke", (s) => (PALE_DAMAGE.includes(s.code) ? COLORS.outline : "none"))
      .transition()
      .duration(TRANSITION_MS)
      .attr("x", (s) => x(s.start))
      .attr("width", (s) => x(s.start + s.n) - x(s.start));
  });

  rows.select(".rate").text((code) => {
    const c = chart.current[code];
    return c.known > 0 ? FORMAT.pct(c.damaging / c.known) : "–";
  });
  rows.select(".selected-outline").attr("visibility", (code) => (selected.includes(code) ? "visible" : "hidden"));
  rows.select(".marker").attr("visibility", (code) => (selected.includes(code) ? "visible" : "hidden"));

  const unknown = chart.current[chart.unknownCode];
  const total = d3.sum(chart.current, (c) => c.strikes);
  const share = total > 0 ? unknown.strikes / total : 0;
  chart.unknownButton
    .text(`${chart.unknownName}: ${FORMAT.count(unknown.strikes)} (${FORMAT.share(share)})`)
    .attr("aria-pressed", selected.includes(chart.unknownCode));
}
