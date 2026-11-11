import { COLORS, FORMAT, TRANSITION_MS } from "../config.js";
import { groupCounts, isFilteredExcept, filterSet, getSelection } from "../state.js";
import { showTooltip, hideTooltip, damageLine } from "../tooltip.js";
import { renderKey, barFill } from "../key.js";

const MARGIN = { top: 20, right: 12, bottom: 20, left: 40 };
const LINE_SHARE = 0.62;
const HANDLE_WIDTH = 8;
const TICK_YEARS = 5;
const charts = {};

const shareAxis = (y) => d3.axisLeft(y).ticks(4).tickFormat(d3.format(".1~%"));

function sharesOf(counts) {
  const total = d3.sum(counts, (v) => v.strikes);
  return counts.map((v) => (total > 0 ? v.strikes / total : 0));
}

function tooltipHtml(chart, i) {
  const all = chart.allCounts[i];
  const selected = chart.current[i];
  const lines = [`<strong>${chart.labels[i]}</strong>`, `${FORMAT.count(all)} strikes (${FORMAT.pct(chart.allShares[i])} of all)`];
  if (isFilteredExcept(chart.name)) {
    lines.push(`${FORMAT.count(selected.strikes)} match the other filters (${FORMAT.pct(sharesOf(chart.current)[i])} of them)`);
  }
  lines.push(damageLine(selected));
  return lines.join("<br>");
}

function frame(svg, box, spec, x, y, xAxis) {
  const g = svg.append("g");
  g.append("g")
    .attr("transform", `translate(0,${box.height - MARGIN.bottom})`)
    .call(xAxis.tickSizeOuter(0));
  const yAxis = g.append("g")
    .attr("transform", `translate(${box.left + MARGIN.left},0)`)
    .call(shareAxis(y));
  g.append("text")
    .attr("x", box.left + MARGIN.left)
    .attr("y", MARGIN.top - 8)
    .attr("font-size", 12)
    .attr("fill", COLORS.ink)
    .text(spec.title);
  return { g, yAxis };
}

function lineIndexAt(chart, px) {
  const i = Math.round(chart.x.invert(px));
  return Math.max(0, Math.min(chart.labels.length - 1, i));
}

function lineChart(svg, box, spec) {
  const n = spec.labels.length;
  const x = d3.scaleLinear()
    .domain([-0.5, n - 0.5])
    .range([box.left + MARGIN.left, box.right - MARGIN.right]);
  const y = d3.scaleLinear()
    .domain([0, d3.max(spec.allShares)])
    .nice()
    .range([box.height - MARGIN.bottom, MARGIN.top]);
  const xAxis = d3.axisBottom(x).tickValues(spec.ticks).tickFormat((i) => spec.tickLabel(i));
  const { g, yAxis } = frame(svg, box, spec, x, y, xAxis);

  const area = d3.area()
    .x((v, i) => x(i))
    .y0(y(0))
    .y1((v) => y(v));
  const context = g.append("path")
    .datum(spec.allShares)
    .attr("fill", COLORS.context)
    .attr("stroke", COLORS.outline)
    .attr("stroke-width", 0.75)
    .attr("d", area);

  const lineGen = d3.line()
    .x((v, i) => x(i))
    .y((v) => y(v));
  const base = g.append("path")
    .attr("fill", "none")
    .attr("stroke", COLORS.neutral)
    .attr("stroke-width", 1.25);
  const selected = g.append("path")
    .attr("fill", "none")
    .attr("stroke", COLORS.accent)
    .attr("stroke-width", 2);
  const rule = g.append("line")
    .attr("y1", MARGIN.top)
    .attr("y2", y(0))
    .attr("stroke", COLORS.ink)
    .attr("stroke-dasharray", "4 3")
    .attr("pointer-events", "none")
    .attr("visibility", "hidden");

  const chart = { ...spec, kind: "line", x, y, g, yAxis, context, area, base, selected, rule, lineGen, current: spec.counts() };
  charts[spec.name] = chart;
  return chart;
}

function addLineBrush(chart) {
  const [left, right] = chart.x.range();
  chart.brush = d3.brushX()
    .extent([[left, MARGIN.top], [right, chart.y(0)]])
    .handleSize(HANDLE_WIDTH)
    .on("end", (event) => {
      if (!event.sourceEvent) return;
      if (!event.selection) {
        filterSet(chart.name, []);
        return;
      }
      const [from, to] = event.selection.map((px) => lineIndexAt(chart, px));
      filterSet(chart.name, d3.range(from, to + 1));
    });

  chart.brushLayer = chart.g.append("g").call(chart.brush);
  chart.brushLayer.select(".selection")
    .attr("fill", COLORS.accent)
    .attr("fill-opacity", 0.06)
    .attr("stroke", COLORS.ink)
    .attr("stroke-dasharray", "4 3");
  chart.brushLayer.selectAll(".handle")
    .attr("fill", COLORS.ink)
    .attr("rx", 2);

  chart.brushLayer
    .on("mousemove.tip", (event) => {
      const i = lineIndexAt(chart, d3.pointer(event, chart.g.node())[0]);
      chart.rule.attr("x1", chart.x(i)).attr("x2", chart.x(i)).attr("visibility", "visible");
      showTooltip(tooltipHtml(chart, i), event);
    })
    .on("mouseleave.tip", () => {
      chart.rule.attr("visibility", "hidden");
      hideTooltip();
    });
}

function barIndexAt(x, px) {
  const i = Math.floor((px - x.range()[0]) / x.step());
  return Math.max(0, Math.min(x.domain().length - 1, i));
}

function barChart(svg, box, spec) {
  const indexes = spec.labels.map((label, i) => i);
  const x = d3.scaleBand()
    .domain(indexes)
    .range([box.left + MARGIN.left, box.right - MARGIN.right])
    .padding(0.15);
  const y = d3.scaleLinear()
    .domain([0, d3.max(spec.allShares)])
    .nice()
    .range([box.height - MARGIN.bottom, MARGIN.top]);
  const xAxis = d3.axisBottom(x).tickFormat((i) => spec.labels[i].charAt(0));
  const { g, yAxis } = frame(svg, box, spec, x, y, xAxis);

  const drawBars = (layer, fill, stroke) => layer.selectAll("rect")
    .data(spec.allShares)
    .join("rect")
    .attr("x", (v, i) => x(i))
    .attr("width", x.bandwidth())
    .attr("y", (v) => y(v))
    .attr("height", (v) => y(0) - y(v))
    .attr("fill", fill)
    .attr("stroke", stroke);

  const context = drawBars(g.append("g"), COLORS.context, COLORS.outline);
  const bars = drawBars(g.append("g"), COLORS.neutral, "none").attr("stroke-width", 1.5);

  const highlight = g.append("rect")
    .attr("width", x.bandwidth())
    .attr("y", MARGIN.top)
    .attr("height", y(0) - MARGIN.top)
    .attr("fill", "none")
    .attr("stroke", COLORS.ink)
    .attr("stroke-dasharray", "4 3")
    .attr("pointer-events", "none")
    .attr("visibility", "hidden");

  const [left, right] = x.range();
  g.append("rect")
    .attr("x", left)
    .attr("width", right - left)
    .attr("y", MARGIN.top)
    .attr("height", y(0) - MARGIN.top)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", (event) => {
      const i = barIndexAt(x, d3.pointer(event, g.node())[0]);
      const selection = new Set(getSelection(spec.name));
      if (selection.has(i)) {
        selection.delete(i);
      } else {
        selection.add(i);
      }
      filterSet(spec.name, [...selection]);
    })
    .on("mousemove.tip", (event) => {
      const i = barIndexAt(x, d3.pointer(event, g.node())[0]);
      highlight.attr("x", x(i)).attr("visibility", "visible");
      showTooltip(tooltipHtml(charts[spec.name], i), event);
    })
    .on("mouseleave.tip", () => {
      highlight.attr("visibility", "hidden");
      hideTooltip();
    });

  const chart = { ...spec, kind: "bar", x, y, g, yAxis, context, bars, current: spec.counts() };
  charts[spec.name] = chart;
  return chart;
}

export function initTimeline(selector, lookups, strikes) {
  const container = document.querySelector(selector);
  const { width, height } = container.getBoundingClientRect();
  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const allByMonth = new Array(lookups.months.length).fill(0);
  const allByMonthOfYear = new Array(lookups.monthNames.length).fill(0);
  strikes.forEach((d) => {
    allByMonth[d.m] += d.n;
    allByMonthOfYear[d.mo] += d.n;
  });
  const split = width * LINE_SHARE;
  const shareOfAll = (counts) => counts.map((n) => n / d3.sum(counts));
  const yearOf = (i) => lookups.months[i].slice(0, 4);

  addLineBrush(lineChart(svg, { left: 0, right: split, height }, {
    name: "month",
    title: "% of strikes per month (drag to select a range, click to clear)",
    labels: lookups.monthLabels,
    allCounts: allByMonth,
    allShares: shareOfAll(allByMonth),
    ticks: lookups.months.map((m, i) => i).filter((i) => lookups.months[i].endsWith("-01") && Number(yearOf(i)) % TICK_YEARS === 0),
    tickLabel: yearOf,
    counts: () => groupCounts("month", lookups.months.length),
  }));

  barChart(svg, { left: split, right: width, height }, {
    name: "monthOfYear",
    title: "% by month of year (click)",
    labels: lookups.monthNames,
    allCounts: allByMonthOfYear,
    allShares: shareOfAll(allByMonthOfYear),
    counts: () => groupCounts("monthOfYear", lookups.monthNames.length),
  });
}

function fitShares(chart, shares) {
  chart.y.domain([0, d3.max([...shares, ...chart.allShares]) || 1]).nice();
  chart.yAxis.transition()
    .duration(TRANSITION_MS)
    .call(shareAxis(chart.y));
  if (chart.kind === "line") {
    chart.context.transition().duration(TRANSITION_MS).attr("d", chart.area);
    return;
  }
  chart.context.transition()
    .duration(TRANSITION_MS)
    .attr("y", (v) => chart.y(v))
    .attr("height", (v) => chart.y(0) - chart.y(v));
}

function updateLine(chart) {
  const selected = getSelection(chart.name);
  const shares = sharesOf(chart.current);
  fitShares(chart, shares);
  const baseColour = selected.length > 0 ? COLORS.neutral : barFill([], 0);
  chart.base.datum(shares)
    .transition()
    .duration(TRANSITION_MS)
    .attr("d", chart.lineGen)
    .attr("stroke", baseColour);
  chart.selected
    .datum(shares)
    .attr("d", chart.lineGen.defined((v, i) => selected.includes(i)));
  chart.lineGen.defined(() => true);

  const extent = selected.length > 0 ? [chart.x(d3.min(selected) - 0.5), chart.x(d3.max(selected) + 0.5)] : null;
  chart.brushLayer.call(chart.brush.move, extent);
}

function updateBars(chart) {
  const selected = getSelection(chart.name);
  const shares = sharesOf(chart.current);
  fitShares(chart, shares);
  chart.bars.data(shares)
    .transition()
    .duration(TRANSITION_MS)
    .attr("y", (v) => chart.y(v))
    .attr("height", (v) => chart.y(0) - chart.y(v))
    .attr("fill", (v, i) => barFill(selected, i))
    .attr("stroke", (v, i) => (selected.includes(i) ? COLORS.ink : "none"));
}

export function updateTimeline() {
  renderKey("#key-timeline", Object.values(charts).some((chart) => getSelection(chart.name).length > 0));
  Object.values(charts).forEach((chart) => {
    chart.current = chart.counts();
    if (chart.kind === "line") {
      updateLine(chart);
    } else {
      updateBars(chart);
    }
  });
}
