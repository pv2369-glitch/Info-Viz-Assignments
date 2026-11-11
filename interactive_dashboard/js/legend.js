import { COLORS } from "./config.js";

export function renderRowLegend(selector) {
  const legend = d3.select(selector);
  const item = legend.append("span").attr("class", "key-item");
  item.append("span")
    .attr("class", "key-swatch")
    .style("background", COLORS.damage)
    .style("border-color", COLORS.damage);
  item.append("span").text("% damaging: share of strikes that damaged the aircraft, where damage was recorded");
  legend.append("span").attr("class", "key").attr("id", "key-envelope");
}
