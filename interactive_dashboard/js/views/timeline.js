import { COLORS, TRANSITION_MS } from "../config.js";
import { yearCounts, monthOfYearCounts, isFiltered } from "../state.js";

const MARGIN = { top: 20, right: 10, bottom: 20, left: 38 };
const YEAR_SHARE = 0.6;
const charts = [];

function countsArray(groupRows, length) {
  const counts = new Array(length).fill(0);
  groupRows.forEach(({ key, value }) => {
    counts[key] = value;
  });
  return counts;
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

  g.append("g")
    .attr("transform", `translate(${box.left + MARGIN.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));

  g.append("text")
    .attr("x", box.left + MARGIN.left)
    .attr("y", MARGIN.top - 8)
    .attr("font-size", 12)
    .attr("fill", COLORS.ink)
    .text(spec.title);

  const drawBars = (layer, fill) => layer.selectAll("rect")
    .data(spec.allCounts)
    .join("rect")
    .attr("x", (v, i) => x(i))
    .attr("width", x.bandwidth())
    .attr("y", (v) => y(v))
    .attr("height", (v) => y(0) - y(v))
    .attr("fill", fill);

  drawBars(g.append("g"), COLORS.context);
  const bars = drawBars(g.append("g"), COLORS.neutral);

  charts.push({ bars, y, counts: spec.counts });
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

  barChart(svg, { left: 0, right: split, height }, {
    title: "Per year",
    labels: lookups.years,
    allCounts: allByYear,
    tickEvery: 5,
    counts: () => countsArray(yearCounts(), lookups.years.length),
  });

  barChart(svg, { left: split, right: width, height }, {
    title: "By month of year",
    labels: lookups.monthNames,
    allCounts: allByMonth,
    tickEvery: 1,
    counts: () => countsArray(monthOfYearCounts(), lookups.monthNames.length),
  });
}

export function updateTimeline() {
  const fill = isFiltered() ? COLORS.accent : COLORS.neutral;
  charts.forEach(({ bars, y, counts }) => {
    bars.data(counts())
      .transition()
      .duration(TRANSITION_MS)
      .attr("y", (v) => y(v))
      .attr("height", (v) => y(0) - y(v))
      .attr("fill", fill);
  });
}
