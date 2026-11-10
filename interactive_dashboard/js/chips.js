import { FORMAT, NOT_RECORDED } from "./config.js";
import { filterSet, getSelection, onChange, groupCounts } from "./state.js";
import { showTooltip, moveTooltip, hideTooltip, damageLine } from "./tooltip.js";

export function initChips(containerId, labels, dimension, unknownLabel, missingShare) {
  const options = labels.map((label, code) => ({
    code,
    unknown: label === unknownLabel,
    text: label === unknownLabel ? NOT_RECORDED : label,
  }));

  const buttons = d3.select(`#${containerId}`)
    .selectAll("button")
    .data(options)
    .join("button")
    .attr("type", "button")
    .attr("class", (o) => (o.unknown ? "chip chip-unknown" : "chip"))
    .text((o) => o.text)
    .on("click", (event, o) => {
      const selected = new Set(getSelection(dimension));
      if (selected.has(o.code)) {
        selected.delete(o.code);
      } else {
        selected.add(o.code);
      }
      filterSet(dimension, [...selected]);
    })
    .on("mouseenter", (event, o) => {
      const v = groupCounts(dimension, labels.length)[o.code];
      showTooltip(`<strong>${o.text}</strong><br>${FORMAT.count(v.strikes)} strikes<br>${damageLine(v)}`, event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip);

  d3.select(`#${containerId}-note`).text(`${FORMAT.share(missingShare)} not recorded`);

  const showPressed = () => {
    const selected = getSelection(dimension);
    buttons.attr("aria-pressed", (o) => selected.includes(o.code));
  };
  onChange(showPressed);
  showPressed();
}
