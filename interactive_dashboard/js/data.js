import { FILES } from "./config.js";

function parseStrike(row) {
  return {
    m: +row.m,
    h: +row.h,
    p: +row.p,
    d: +row.d,
    g: +row.g,
    t: +row.t,
    s: +row.s,
    a: +row.a,
    n: +row.n,
    c: +row.c,
    cn: +row.cn,
  };
}

function parseAirport(row) {
  return {
    i: +row.i,
    id: row.airport_id,
    name: row.airport,
    state: row.state,
    lat: +row.lat,
    lon: +row.lon,
    strikes: +row.strikes,
    knownDamage: +row.known_damage,
    damaging: +row.damaging,
  };
}

export async function loadData() {
  const [lookups, rows, airportRows, us] = await Promise.all([
    d3.json(FILES.lookups),
    d3.csv(FILES.strikes, parseStrike),
    d3.csv(FILES.airports, parseAirport),
    d3.json(FILES.usAtlas),
  ]);

  const isDamaging = lookups.damage.map((level) => level.damaging);
  const monthOfYear = lookups.months.map((month) => Number(month.slice(5, 7)) - 1);
  lookups.monthLabels = lookups.months.map((month) => d3.timeFormat("%b %Y")(d3.timeParse("%Y-%m")(month)));
  lookups.airportIds = airportRows.map((a) => a.id);
  lookups.monthNames = d3.range(d3.max(monthOfYear) + 1).map((i) => d3.timeFormat("%b")(new Date(2000, i, 1)));

  const strikes = rows.map((r) => ({
    ...r,
    mo: monthOfYear[r.m],
    damagingN: isDamaging[r.d] ? r.n : 0,
    knownDamageN: isDamaging[r.d] === null ? 0 : r.n,
  }));

  const airports = [];
  airportRows.forEach((a) => {
    airports[a.i] = a;
  });

  return { lookups, strikes, airports, us };
}
