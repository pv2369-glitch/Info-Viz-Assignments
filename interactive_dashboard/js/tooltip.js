import { FORMAT } from "./config.js";

const OFFSET = 14;

function tip() {
  return d3.select("#tooltip");
}

export function moveTooltip(event) {
  const { width, height } = tip().node().getBoundingClientRect();
  let x = event.clientX + OFFSET;
  let y = event.clientY + OFFSET;
  if (x + width > window.innerWidth) x = event.clientX - OFFSET - width;
  if (y + height > window.innerHeight) y = event.clientY - OFFSET - height;
  tip().style("left", `${x}px`).style("top", `${y}px`);
}

export function showTooltip(html, event) {
  tip().html(html).property("hidden", false);
  moveTooltip(event);
}

export function hideTooltip() {
  tip().property("hidden", true);
}

export function damageLine(v) {
  if (v.known === 0) return "Damage not recorded";
  return `${FORMAT.pct(v.damaging / v.known)} damaging (of ${FORMAT.count(v.known)} with known damage)`;
}
