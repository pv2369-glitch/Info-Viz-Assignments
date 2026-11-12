import { FORMAT, MIN_RATE_KNOWN } from "./config.js";

export function initAbout(data, grand) {
  const { lookups, strikes, airports } = data;
  const firstYear = lookups.months[0].slice(0, 4);
  const lastYear = lookups.months[lookups.months.length - 1].slice(0, 4);
  const unknownHeight = lookups.height.indexOf(lookups.unknown);
  const heightMissing = d3.sum(strikes, (d) => (d.h === unknownHeight ? d.n : 0)) / grand.strikes;

  const facts = {
    strikes: FORMAT.count(grand.strikes),
    years: `${firstYear} to ${lastYear}`,
    airports: FORMAT.count(airports.length),
    heightMissing: FORMAT.share(heightMissing),
    minRate: MIN_RATE_KNOWN,
  };
  d3.selectAll("[data-fact]").filter(function () {
    return this.dataset.fact in facts;
  }).text(function () {
    return facts[this.dataset.fact];
  });
  d3.select("#eyebrow-text").text(
    `Wildlife strikes on US aircraft · FAA data ${firstYear}–${lastYear} · ${facts.strikes} strikes · ${facts.airports} airports`,
  );

  const dialog = document.querySelector("#about");
  const close = () => {
    markSeen();
    dialog.close();
  };
  d3.select("#about-close").on("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("cancel", markSeen);
  if (!hasSeen()) dialog.showModal();
}

const SEEN_KEY = "about-seen";

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
