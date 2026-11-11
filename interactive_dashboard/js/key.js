import { COLORS } from "./config.js";
import { isFiltered } from "./state.js";

export function barFill(selected, code) {
  if (!isFiltered()) return COLORS.neutral;
  if (selected.length > 0 && !selected.includes(code)) return COLORS.neutral;
  return COLORS.accent;
}

export function renderKey(selector, hasOwnSelection) {
  const items = [];
  if (isFiltered()) {
    items.push({ label: "All strikes", fill: COLORS.context, stroke: COLORS.outline });
    items.push({ label: "In selection", fill: COLORS.accent, stroke: COLORS.accent });
    if (hasOwnSelection) {
      items.push({ label: "Outside selection", fill: COLORS.neutral, stroke: COLORS.neutral });
    }
  }
  d3.select(selector)
    .selectAll(".key-item")
    .data(items, (d) => d.label)
    .join((enter) => {
      const item = enter.append("span").attr("class", "key-item");
      item.append("span").attr("class", "key-swatch");
      item.append("span").attr("class", "key-label");
      return item;
    })
    .call((item) => {
      item.select(".key-swatch").style("background", (d) => d.fill).style("border-color", (d) => d.stroke);
      item.select(".key-label").text((d) => d.label);
    });
}
