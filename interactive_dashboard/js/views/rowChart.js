import { COLORS, FORMAT, TRANSITION_MS } from "../config.js";
import { groupCounts, getSelection, filterSet, isFilteredExcept } from "../state.js";
import { showTooltip, hideTooltip, damageLine } from "../tooltip.js";
import { barFill } from "../key.js";

const MARGIN = { top: 18, right: 40, bottom: 22, left: 78 };
const GAP = 26;
const STEP = 30;
const COUNT_SHARE = 0.45;
const RATE_STEP = 0.1;
const charts = [];

export function rowAt(chart, py) {
  const { y } = chart;
  const i = Math.floor((py - y.range()[0]) / y.step());
  return y.domain()[Math.max(0, Math.min(y.domain().length - 1, i))];
}

function rateOf(counts) {
  return counts.known > 0 ? counts.damaging / counts.known : null;
}

function severityLine(chart, counts) {
  const parts = chart.damageLevels
    .map((level, i) => ({ level, n: counts.byDamage[i] }))
    .filter(({ level, n }) => level.damaging && n > 0)
    .map(({ level, n }) => `${level.label} ${FORMAT.count(n)}`);
  return parts.length ? parts.join(" · ") : "No damaging strikes";
}

function tooltipHtml(chart, code) {
  const counts = chart.current[code];
  return [
    `<strong>${chart.formatLabel(chart.labels[code])}</strong>`,
    `${FORMAT.count(counts.strikes)} strikes${isFilteredExcept(chart.dimension) ? " matching the other filters" : ""}`,
    damageLine(counts),
    severityLine(chart, counts),
    `Damage not recorded: ${FORMAT.count(counts.byDamage[chart.unknownDamage])}`,
  ].join("<br>");
}

export function attachHover(chart, target) {
  target
    .on("mousemove.tip", (event) => {
      const code = rowAt(chart, d3.pointer(event, chart.svg.node())[1]);
      chart.highlight.attr("y", chart.y(code)).attr("visibility", "visible");
      showTooltip(tooltipHtml(chart, code), event);
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

export function createRowChart(spec) {
  const container = document.querySelector(spec.selector);
  const { width } = container.getBoundingClientRect();
  const unknownCode = spec.labels.indexOf(spec.unknown);
  const knownCodes = spec.labels.map((label, code) => code).filter((code) => code !== unknownCode);
  const plotBottom = MARGIN.top + knownCodes.length * STEP;

  const allTotals = new Array(spec.labels.length).fill(0);
  spec.strikes.forEach((d) => {
    allTotals[d[spec.field]] += d.n;
  });

  const countWidth = (width - MARGIN.left - MARGIN.right - GAP) * COUNT_SHARE;
  const y = d3.scaleBand()
    .domain(spec.upward ? [...knownCodes].reverse() : knownCodes)
    .range([MARGIN.top, plotBottom])
    .padding(0.25);
  const x = d3.scaleLinear()
    .domain([0, d3.max(knownCodes, (code) => allTotals[code])])
    .nice()
    .range([MARGIN.left, MARGIN.left + countWidth]);
  const r = d3.scaleLinear()
    .range([MARGIN.left + countWidth + GAP, width - MARGIN.right]);

  const svgHeight = plotBottom + MARGIN.bottom;
  container.style.flex = "0 0 auto";
  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", [0, 0, width, svgHeight])
    .style("height", `${svgHeight}px`);

  const header = (xPos, text) => svg.append("text")
    .attr("x", xPos)
    .attr("y", MARGIN.top - 6)
    .attr("font-size", 10)
    .attr("fill", COLORS.ink)
    .text(text);
  header(x.range()[0], "Strikes");
  header(r.range()[0], "% damaging");

  svg.append("g")
    .attr("transform", `translate(0,${plotBottom})`)
    .call(d3.axisBottom(x).ticks(2).tickFormat(d3.format("~s")).tickSizeOuter(0));
  const rateAxis = svg.append("g").attr("transform", `translate(0,${plotBottom})`);
  svg.append("g")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(d3.axisLeft(y).tickSize(0).tickPadding(6).tickFormat((code) => spec.formatLabel(spec.labels[code])));
  svg.append("line")
    .attr("x1", r.range()[0])
    .attr("x2", r.range()[0])
    .attr("y1", MARGIN.top)
    .attr("y2", plotBottom)
    .attr("stroke", COLORS.ink);

  const rows = svg.append("g")
    .selectAll("g")
    .data(knownCodes)
    .join("g")
    .attr("transform", (code) => `translate(0,${y(code)})`);

  const fullBar = (selection, cls) => selection.append("rect")
    .attr("class", cls)
    .attr("x", x(0))
    .attr("width", (code) => x(allTotals[code]) - x(0))
    .attr("height", y.bandwidth());
  fullBar(rows, "context").attr("fill", COLORS.context).attr("stroke", COLORS.outline);
  fullBar(rows, "bar").attr("fill", COLORS.neutral);
  fullBar(rows, "selected-outline")
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
  rows.append("rect")
    .attr("class", "rate-bar")
    .attr("x", r.range()[0])
    .attr("width", 0)
    .attr("height", y.bandwidth())
    .attr("fill", COLORS.damage);
  rows.append("text")
    .attr("class", "rate")
    .attr("x", r.range()[0] + 4)
    .attr("y", y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", 11)
    .attr("fill", COLORS.ink);

  const highlight = svg.append("rect")
    .attr("x", x(0))
    .attr("width", width - MARGIN.right - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", "none")
    .attr("stroke", COLORS.ink)
    .attr("stroke-dasharray", "4 3")
    .attr("pointer-events", "none")
    .attr("visibility", "hidden");

  const chart = {
    svg, x, y, r, rows, rateAxis, highlight, unknownCode,
    plot: { left: x(0), right: width - MARGIN.right, top: MARGIN.top, bottom: plotBottom },
    dimension: spec.dimension,
    labels: spec.labels,
    formatLabel: spec.formatLabel,
    unknownName: spec.unknownName,
    damageLevels: spec.damageLevels,
    unknownDamage: spec.damageLevels.findIndex((level) => level.damaging === null),
    current: groupCounts(spec.dimension, spec.labels.length),
  };

  chart.unknownButton = d3.select(spec.unknownButton)
    .on("click", () => toggleCode(chart, unknownCode))
    .on("mouseenter", (event) => {
      const counts = chart.current[unknownCode];
      showTooltip(`<strong>${spec.unknownName}</strong><br>${FORMAT.count(counts.strikes)} strikes<br>${damageLine(counts)}`, event);
    })
    .on("mouseleave", hideTooltip);

  charts.push(chart);
  return chart;
}

function renderChart(chart, rateMax) {
  const { x, r, rows } = chart;
  const selected = getSelection(chart.dimension);
  r.domain([0, rateMax]);

  chart.rateAxis.transition()
    .duration(TRANSITION_MS)
    .call(d3.axisBottom(r).tickValues(d3.range(0, rateMax + 1e-9, rateMax > 0.3 ? 0.2 : RATE_STEP)).tickFormat(d3.format(".0%")).tickSizeOuter(0));

  rows.select(".bar")
    .transition()
    .duration(TRANSITION_MS)
    .attr("width", (code) => x(chart.current[code].strikes) - x(0))
    .attr("fill", (code) => barFill(selected, code));
  rows.select(".rate-bar")
    .transition()
    .duration(TRANSITION_MS)
    .attr("width", (code) => r(rateOf(chart.current[code]) ?? 0) - r(0));
  rows.select(".rate")
    .text((code) => {
      const rate = rateOf(chart.current[code]);
      return rate === null ? "no damage recorded" : FORMAT.pct(rate);
    })
    .transition()
    .duration(TRANSITION_MS)
    .attr("x", (code) => r(rateOf(chart.current[code]) ?? 0) + 4);
  rows.select(".selected-outline").attr("visibility", (code) => (selected.includes(code) ? "visible" : "hidden"));
  rows.select(".marker").attr("visibility", (code) => (selected.includes(code) ? "visible" : "hidden"));

  const unknown = chart.current[chart.unknownCode];
  const total = d3.sum(chart.current, (c) => c.strikes);
  const share = total > 0 ? unknown.strikes / total : 0;
  chart.unknownButton
    .text(`${chart.unknownName}: ${FORMAT.count(unknown.strikes)} (${FORMAT.share(share)})`)
    .attr("aria-pressed", selected.includes(chart.unknownCode));
}

export function updateRowCharts() {
  charts.forEach((chart) => {
    chart.current = groupCounts(chart.dimension, chart.labels.length);
  });
  const rates = charts.flatMap((chart) => chart.y.domain().map((code) => rateOf(chart.current[code]) ?? 0));
  const rateMax = Math.max(1, Math.ceil(d3.max(rates) / RATE_STEP)) / (1 / RATE_STEP);
  charts.forEach((chart) => renderChart(chart, rateMax));
}
