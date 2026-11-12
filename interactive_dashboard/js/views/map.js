import { COLORS, DAMAGE_RAMP, FORMAT, TRANSITION_MS, RATE_BREAKS, MIN_RATE_KNOWN } from "../config.js";
import { groupCounts, isFiltered, isFilteredExcept, getSelection, filterSet } from "../state.js";
import { showTooltip, moveTooltip, hideTooltip, damageLine } from "../tooltip.js";

const MAX_RADIUS = 20;
const PADDING = 8;
const SELECTED_STROKE = 2.5;
const MAX_ZOOM = 8;
const CLUSTER_PX = 14;
const SMALL_RADIUS = 6;
const rateColour = d3.scaleThreshold().domain(RATE_BREAKS).range(DAMAGE_RAMP);
let chart;

function fillFor(counts) {
  if (counts.known < MIN_RATE_KNOWN) return "#ffffff";
  return rateColour(counts.damaging / counts.known);
}

function countsOf(mark) {
  const sum = { strikes: 0, damaging: 0, known: 0 };
  mark.members.forEach((airport) => {
    const counts = chart.current[airport.i];
    sum.strikes += counts.strikes;
    sum.damaging += counts.damaging;
    sum.known += counts.known;
  });
  return sum;
}

function tooltipHtml(mark) {
  const counts = mark.counts;
  const lead = mark.members[0];
  const title = mark.members.length === 1
    ? `<strong>${lead.name}</strong> (${lead.id}, ${lead.state})`
    : `<strong>${mark.members.length} airports around ${lead.id}</strong> (${[...new Set(mark.members.map((a) => a.state))].join(", ")}), click to zoom in`;
  return [
    title,
    `${FORMAT.count(counts.damaging)} damaging of ${FORMAT.count(counts.strikes)} strikes${isFilteredExcept("airport") ? " matching the other filters" : ""}`,
    counts.known < MIN_RATE_KNOWN ? `Fewer than ${MIN_RATE_KNOWN} strikes with recorded damage: too few to rate` : damageLine(counts),
  ].join("<br>");
}

function renderLegend(selector, r, unmapped) {
  const legend = d3.select(selector);
  const sizes = legend.append("span").attr("class", "key-item");
  sizes.append("span").attr("class", "legend-title").text("Area = damaging strikes:");
  const max = r.domain()[1];
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const top = Math.floor(max / magnitude) * magnitude;
  const examples = [top / 100, top / 10, top].filter((value) => value >= 1);
  const biggest = r(top);
  const svg = sizes.append("svg").attr("height", biggest * 2 + 2);
  let x = 0;
  examples.forEach((value) => {
    const radius = r(value);
    svg.append("circle")
      .attr("cx", x + radius)
      .attr("cy", biggest * 2 + 1 - radius)
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", COLORS.outline);
    svg.append("text")
      .attr("x", x + radius * 2 + 3)
      .attr("y", biggest * 2)
      .attr("font-size", 11)
      .attr("fill", COLORS.ink)
      .text(d3.format("~s")(value));
    x += radius * 2 + 30;
  });
  svg.attr("width", x);

  const colours = legend.append("span").attr("class", "key-item");
  colours.append("span").attr("class", "legend-title").text("% damaging:");
  const bounds = [0, ...RATE_BREAKS];
  DAMAGE_RAMP.forEach((colour, i) => {
    const label = i < RATE_BREAKS.length
      ? `${FORMAT.share(bounds[i])}–${FORMAT.share(bounds[i + 1])}`
      : `${FORMAT.share(bounds[i])}+`;
    const item = colours.append("span").attr("class", "key-item");
    item.append("span").attr("class", "key-swatch").style("background", colour).style("border-color", COLORS.outline);
    item.append("span").text(label);
  });
  const few = colours.append("span").attr("class", "key-item");
  few.append("span").attr("class", "key-swatch").style("background", "#ffffff").style("border-color", COLORS.outline);
  few.append("span").text(`too few to rate (<${MIN_RATE_KNOWN})`);

  d3.selectAll("[data-fact=unmapped]").text(FORMAT.count(unmapped));
}

function setAirports(codes) {
  filterSet("airport", [...new Set(codes)]);
}

function toggleAirports(ids) {
  const selected = new Set(getSelection("airport"));
  const remove = ids.every((i) => selected.has(i));
  ids.forEach((i) => (remove ? selected.delete(i) : selected.add(i)));
  setAirports([...selected]);
}

function zoomTo(mark) {
  const [x0, x1] = d3.extent(mark.members, (a) => a.xy[0]);
  const [y0, y1] = d3.extent(mark.members, (a) => a.xy[1]);
  const fit = 0.5 * Math.min(chart.width / (x1 - x0 || 1), chart.height / (y1 - y0 || 1));
  const k = Math.min(MAX_ZOOM, Math.max(2 ** (chart.level + 1), fit));
  const target = d3.zoomIdentity
    .translate(chart.width / 2, chart.height / 2)
    .scale(k)
    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  chart.svg.transition().duration(TRANSITION_MS * 2).call(chart.zoom.transform, target);
}

function clickMark(event, mark) {
  event.stopPropagation();
  const ids = mark.members.map((a) => a.i);
  if (event.shiftKey) {
    toggleAirports(ids);
    return;
  }
  if (ids.length > 1) {
    zoomTo(mark);
    return;
  }
  const selected = getSelection("airport");
  const onlyThis = selected.length === 1 && selected[0] === ids[0];
  setAirports(onlyThis ? [] : ids);
}

function stateCode(feature) {
  if (!chart.stateCodes.has(feature)) {
    const inside = chart.placed.filter((airport) => d3.geoContains(feature, [airport.lon, airport.lat]));
    const counts = d3.rollup(inside, (v) => v.length, (airport) => airport.state);
    const best = d3.greatest(counts, ([, n]) => n);
    chart.stateCodes.set(feature, best ? best[0] : null);
    if (best) chart.stateNames[best[0]] = feature.properties.name;
  }
  return chart.stateCodes.get(feature);
}

function stateAt(event) {
  const point = chart.transform.invert(d3.pointer(event, chart.svg.node()));
  const lonLat = chart.projection.invert(point);
  if (!lonLat) return null;
  const feature = chart.states.find((f) => d3.geoContains(f, lonLat));
  return feature && stateCode(feature) ? feature : null;
}

function airportsIn(code) {
  return chart.airports.filter((airport) => airport && airport.state === code).map((airport) => airport.i);
}

function isStateSelected(code, selected) {
  const ids = airportsIn(code);
  return ids.length > 0 && ids.every((i) => selected.has(i));
}

function clickState(event, additive) {
  const feature = stateAt(event);
  if (!feature) {
    if (!additive) setAirports([]);
    return;
  }
  const code = stateCode(feature);
  const ids = airportsIn(code);
  if (additive) {
    toggleAirports(ids);
    return;
  }
  const selected = new Set(getSelection("airport"));
  const onlyThis = selected.size === ids.length && isStateSelected(code, selected);
  setAirports(onlyThis ? [] : ids);
}

function boxSelect(event) {
  if (!event.sourceEvent) return;
  if (!event.selection) {
    clickState(event.sourceEvent, true);
    return;
  }
  const [[x0, y0], [x1, y1]] = event.selection;
  const inside = chart.placed
    .filter((airport) => {
      const [x, y] = chart.transform.apply(airport.xy);
      return x >= x0 && x <= x1 && y >= y0 && y <= y1;
    })
    .map((airport) => airport.i);
  chart.brushLayer.call(chart.brush.move, null);
  setAirports([...getSelection("airport"), ...inside]);
}

function levelFor(k) {
  return Math.min(chart.maxLevel, Math.floor(Math.log2(k) + 1e-9));
}

function clusterLevel(level) {
  if (chart.levels.has(level)) return chart.levels.get(level);
  const scale = level >= chart.maxLevel ? 0 : 2 ** level;
  const isSmall = (airport) => chart.r(chart.initial[airport.i].damaging) < SMALL_RADIUS;
  const reach = scale ? CLUSTER_PX / scale : 0;
  const taken = new Set();
  const marks = [];
  chart.drawable.forEach((lead) => {
    if (taken.has(lead.i)) return;
    const members = [lead];
    taken.add(lead.i);
    const [cx, cy] = lead.xy;
    if (!scale || !isSmall(lead)) {
      marks.push({ key: lead.i, members, xy: lead.xy });
      return;
    }
    chart.tree.visit((node, x0, y0, x1, y1) => {
      if (!node.length) {
        let leaf = node;
        do {
          const airport = leaf.data;
          if (!taken.has(airport.i) && isSmall(airport) && Math.hypot(airport.xy[0] - cx, airport.xy[1] - cy) < reach) {
            members.push(airport);
            taken.add(airport.i);
          }
          leaf = leaf.next;
        } while (leaf);
      }
      return x0 > cx + reach || x1 < cx - reach || y0 > cy + reach || y1 < cy - reach;
    });
    const weight = d3.sum(members, (a) => a.strikes);
    const xy = [
      d3.sum(members, (a) => a.xy[0] * a.strikes) / weight,
      d3.sum(members, (a) => a.xy[1] * a.strikes) / weight,
    ];
    marks.push({ key: lead.i, members, xy });
  });
  chart.levels.set(level, marks);
  return marks;
}

function refreshCounts() {
  chart.current = groupCounts("airport", chart.size);
  chart.marks.forEach((mark) => {
    mark.counts = countsOf(mark);
  });
}

function renderLevel(level) {
  const previous = new Map();
  (chart.marks ?? []).forEach((mark) => mark.members.forEach((a) => previous.set(a.i, mark.xy)));
  chart.level = level;
  chart.marks = clusterLevel(level);
  refreshCounts();
  const next = new Map();
  chart.marks.forEach((mark) => mark.members.forEach((a) => next.set(a.i, mark.xy)));

  chart.markGroups = chart.markLayer
    .selectAll("g.mark")
    .data(chart.marks, (mark) => mark.key)
    .join(
      (enter) => {
        const g = enter.append("g")
          .attr("class", "mark")
          .attr("transform", (mark) => `translate(${previous.get(mark.key) ?? mark.xy})`)
          .style("cursor", "pointer")
          .on("click", clickMark)
          .on("mouseenter", (event, mark) => showTooltip(tooltipHtml(mark), event))
          .on("mousemove", moveTooltip)
          .on("mouseleave", hideTooltip);
        g.append("circle").attr("r", 0);
        return g;
      },
      (update) => update,
      (exit) => exit.transition()
        .duration(TRANSITION_MS)
        .attr("transform", (mark) => `translate(${next.get(mark.key) ?? mark.xy})`)
        .style("opacity", 0)
        .remove(),
    );
}

function styleMarks(animate) {
  const { k } = chart.transform;
  const selected = new Set(getSelection("airport"));
  const isSelected = (mark) => mark.members.every((a) => selected.has(a.i));
  const step = (selection) => (animate ? selection.transition().duration(TRANSITION_MS) : selection);
  const groups = chart.markGroups.sort((a, b) => d3.descending(a.counts.damaging, b.counts.damaging));
  groups.filter(isSelected).raise();

  step(groups).attr("transform", (mark) => `translate(${mark.xy})`);
  step(groups.select("circle"))
    .attr("r", (mark) => chart.r(mark.counts.damaging) / k)
    .attr("fill", (mark) => fillFor(mark.counts));
  groups.select("circle")
    .attr("stroke", (mark) => (isSelected(mark) ? COLORS.accent : COLORS.outline))
    .attr("stroke-width", (mark) => (isSelected(mark) ? SELECTED_STROKE : 1) / k);
}

function drawStates() {
  const { k } = chart.transform;
  const selected = new Set(getSelection("airport"));
  const stateOn = (f) => Boolean(chart.stateCodes.get(f)) && isStateSelected(chart.stateCodes.get(f), selected);
  chart.layers.attr("transform", chart.transform);
  chart.statePaths
    .attr("stroke", (f) => (stateOn(f) ? COLORS.accent : COLORS.line))
    .attr("stroke-width", (f) => (stateOn(f) ? SELECTED_STROKE : 0.75) / k);
}

export function initMap(selector, legendSelector, data) {
  const container = document.querySelector(selector);
  const { width, height } = container.getBoundingClientRect();
  const states = topojson.feature(data.us, data.us.objects.states);
  const projection = d3.geoAlbersUsa().fitExtent([[PADDING, PADDING], [width - PADDING, height - PADDING]], states);
  const path = d3.geoPath(projection);

  const initial = groupCounts("airport", data.airports.length);
  const placed = data.airports
    .map((airport) => ({ ...airport, xy: projection([airport.lon, airport.lat]) }))
    .filter((airport) => airport.xy !== null)
    .sort((a, b) => initial[b.i].damaging - initial[a.i].damaging);
  const drawable = placed.filter((airport) => initial[airport.i].damaging > 0);
  const placedIndex = new Set(placed.map((airport) => airport.i));
  const unmapped = d3.sum(data.strikes, (d) => (placedIndex.has(d.a) ? 0 : d.n));

  const r = d3.scaleSqrt()
    .domain([0, d3.max(placed, (airport) => initial[airport.i].damaging)])
    .range([0, MAX_RADIUS]);

  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);
  const stateLayer = svg.append("g");
  const statePaths = stateLayer
    .selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", COLORS.envelope)
    .attr("stroke", COLORS.line)
    .attr("stroke-width", 0.75);

  const brush = d3.brush()
    .extent([[0, 0], [width, height]])
    .filter((event) => event.shiftKey && !event.button)
    .on("end", boxSelect);
  const brushLayer = svg.append("g").call(brush);
  brushLayer.select(".overlay").attr("cursor", "grab");
  brushLayer.select(".selection")
    .attr("fill", COLORS.accent)
    .attr("fill-opacity", 0.08)
    .attr("stroke", COLORS.accent)
    .attr("stroke-dasharray", "4 3");

  const markLayer = svg.append("g");

  const zoom = d3.zoom()
    .scaleExtent([1, MAX_ZOOM])
    .translateExtent([[0, 0], [width, height]])
    .filter((event) => (event.type === "wheel" || !event.shiftKey) && !event.button)
    .on("zoom", (event) => {
      chart.transform = event.transform;
      const level = levelFor(event.transform.k);
      if (level !== chart.level) renderLevel(level);
      styleMarks(false);
      drawStates();
      d3.select("#map-zoom-reset").property("disabled", event.transform.k === 1);
      d3.select("#reset").property("disabled", !isFiltered() && event.transform.k === 1);
    });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", (event) => {
    if (!event.shiftKey) clickState(event, false);
  });
  d3.select("#map-zoom-reset")
    .property("disabled", true)
    .on("click", resetZoom);

  chart = {
    svg, zoom, statePaths, r, brush, brushLayer, projection, placed, drawable, markLayer, width, height,
    tree: d3.quadtree(drawable, (a) => a.xy[0], (a) => a.xy[1]),
    layers: d3.selectAll([stateLayer.node(), markLayer.node()]),
    states: states.features,
    stateCodes: new Map(),
    stateNames: data.lookups.stateNames,
    levels: new Map(),
    maxLevel: Math.log2(MAX_ZOOM),
    airports: data.airports,
    transform: d3.zoomIdentity,
    size: data.airports.length,
    current: initial,
    initial,
  };
  renderLevel(0);
  styleMarks(false);
  renderLegend(legendSelector, r, unmapped);
}

export function isZoomed() {
  return Boolean(chart) && chart.transform.k > 1;
}

export function resetZoom() {
  if (chart) chart.svg.transition().duration(TRANSITION_MS).call(chart.zoom.transform, d3.zoomIdentity);
}

export function updateMap() {
  refreshCounts();
  styleMarks(true);
  drawStates();
}
