import { COLORS, FORMAT, TRANSITION_MS } from "../config.js";
import { groupCounts, isFilteredExcept, filterSet, getSelection } from "../state.js";
import { showTooltip, hideTooltip, damageLine } from "../tooltip.js";
import { renderKey, barFill } from "../key.js";

const MARGIN = { top: 20, right: 10, bottom: 20, left: 38 };
const YEAR_SHARE = 0.6;
const charts = {};

function tooltipHtml(name, label, all, selected) {
  const lines = [`<strong>${label}</strong>`, `${FORMAT.count(all)} strikes`];
  if (isFilteredExcept(name)) {
    const share = all > 0 ? selected.strikes / all : 0;
    lines.push(`${FORMAT.count(selected.strikes)} match the other filters (${FORMAT.pct(share)})`);
  }
  lines.push(damageLine(selected));
  return lines.join("<br>");
}

function indexAt(x, px) {
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
    .domain([0, d3.max(spec.allCounts)])
    .nice()
    .range([box.height - MARGIN.bottom, MARGIN.top]);

  const g = svg.append("g");

  g.append("g")
    .attr("transform", `translate(0,${box.height - MARGIN.bottom})`)
    .call(d3.axisBottom(x)
      .tickValues(indexes.filter((i) => i % spec.tickEvery === 0))
      .tickFormat((i) => spec.labels[i])
      .tickSizeOuter(0));

  const yAxis = g.append("g")
    .attr("transform", `translate(${box.left + MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));

  g.append("text")
    .attr("x", box.left + MARGIN.left)
    .attr("y", MARGIN.top - 8)
    .attr("font-size", 12)
    .attr("fill", COLORS.ink)
    .text(spec.title);

  const drawBars = (layer, fill, stroke) => layer.selectAll("rect")
    .data(spec.allCounts)
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

  const chart = { ...spec, x, y, g, yAxis, context, bars, highlight, current: spec.counts() };
  charts[spec.name] = chart;
  return chart;
}

function addHover(chart, target) {
  target
    .on("mousemove.tip", (event) => {
      const i = indexAt(chart.x, d3.pointer(event, chart.g.node())[0]);
      chart.highlight.attr("x", chart.x(i)).attr("visibility", "visible");
      showTooltip(tooltipHtml(chart.name, chart.labels[i], chart.allCounts[i], chart.current[i]), event);
    })
    .on("mouseleave.tip", () => {
      chart.highlight.attr("visibility", "hidden");
      hideTooltip();
    });
}

function addBrush(chart) {
  const [left, right] = chart.x.range();
  const centre = (i) => chart.x(i) + chart.x.bandwidth() / 2;

  chart.brush = d3.brushX()
    .extent([[left, MARGIN.top], [right, chart.y(0)]])
    .on("end", (event) => {
      if (!event.sourceEvent) return;
      if (event.selection) {
        const [a, b] = event.selection;
        const inside = chart.x.domain().filter((i) => centre(i) >= a && centre(i) <= b);
        filterSet(chart.name, inside.length ? inside : [indexAt(chart.x, a)]);
      } else {
        const i = indexAt(chart.x, d3.pointer(event.sourceEvent, chart.g.node())[0]);
        const current = getSelection(chart.name);
        filterSet(chart.name, current.length === 1 && current[0] === i ? [] : [i]);
      }
    });

  chart.brushLayer = chart.g.append("g").call(chart.brush);
  chart.brushLayer.select(".selection")
    .attr("fill", COLORS.accent)
    .attr("fill-opacity", 0.08)
    .attr("stroke", COLORS.accent);
  addHover(chart, chart.brushLayer);
}

function addClick(chart) {
  const [left, right] = chart.x.range();
  const overlay = chart.g.append("rect")
    .attr("x", left)
    .attr("width", right - left)
    .attr("y", MARGIN.top)
    .attr("height", chart.y(0) - MARGIN.top)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", (event) => {
      const i = indexAt(chart.x, d3.pointer(event, chart.g.node())[0]);
      const selected = new Set(getSelection(chart.name));
      if (selected.has(i)) {
        selected.delete(i);
      } else {
        selected.add(i);
      }
      filterSet(chart.name, [...selected]);
    });
  addHover(chart, overlay);
}

function syncBrush(chart) {
  const codes = getSelection(chart.name);
  const extent = codes.length
    ? [chart.x(d3.min(codes)), chart.x(d3.max(codes)) + chart.x.bandwidth()]
    : null;
  chart.brushLayer.call(chart.brush.move, extent);
}

export function initTimeline(selector, lookups, strikes) {
  const container = document.querySelector(selector);
  const { width, height } = container.getBoundingClientRect();
  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const allByYear = new Array(lookups.years.length).fill(0);
  const allByMonth = new Array(lookups.monthNames.length).fill(0);
  strikes.forEach((d) => {
    allByYear[d.y] += d.n;
    allByMonth[d.mo] += d.n;
  });
  const split = width * YEAR_SHARE;

  addBrush(barChart(svg, { left: 0, right: split, height }, {
    name: "year",
    title: "Per year (click or drag to select)",
    labels: lookups.years,
    allCounts: allByYear,
    tickEvery: 5,
    counts: () => groupCounts("year", lookups.years.length),
  }));

  addClick(barChart(svg, { left: split, right: width, height }, {
    name: "monthOfYear",
    title: "By month of year (click to select)",
    labels: lookups.monthNames,
    allCounts: allByMonth,
    tickEvery: 1,
    rescaleWhen: "year",
    counts: () => groupCounts("monthOfYear", lookups.monthNames.length),
  }));
}

export function updateTimeline() {
  renderKey("#key-timeline", Object.values(charts).some((chart) => getSelection(chart.name).length > 0));
  Object.values(charts).forEach((chart) => {
    chart.current = chart.counts();
    const selected = getSelection(chart.name);
    const rescale = Boolean(chart.rescaleWhen) && getSelection(chart.rescaleWhen).length > 0;
    const max = rescale ? d3.max(chart.current, (v) => v.strikes) : d3.max(chart.allCounts);
    chart.y.domain([0, max || 1]).nice();

    chart.yAxis.transition()
      .duration(TRANSITION_MS)
      .call(d3.axisLeft(chart.y).ticks(4).tickFormat(d3.format("~s")));
    chart.context.transition()
      .duration(TRANSITION_MS)
      .attr("opacity", rescale ? 0 : 1);
    chart.bars.data(chart.current)
      .transition()
      .duration(TRANSITION_MS)
      .attr("y", (v) => chart.y(v.strikes))
      .attr("height", (v) => chart.y(0) - chart.y(v.strikes))
      .attr("fill", (v, i) => barFill(selected, i))
      .attr("stroke", (v, i) => (selected.includes(i) ? COLORS.ink : "none"));

    if (chart.brush) syncBrush(chart);
  });
}
