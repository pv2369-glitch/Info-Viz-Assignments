import argparse
import io
import shutil
import subprocess
import sys
from pathlib import Path

import re

import pandas as pd

OUT = Path("data")
YEAR_MIN, YEAR_MAX = 2000, 2025

ALIASES = {
    "id": ["INDEX_NR", "INDEX NR"],
    "date": ["INCIDENT_DATE"],
    "year": ["INCIDENT_YEAR"],
    "month": ["INCIDENT_MONTH"],
    "time_of_day": ["TIME_OF_DAY"],
    "airport_id": ["AIRPORT_ID"],
    "airport": ["AIRPORT"],
    "state": ["STATE"],
    "phase": ["PHASE_OF_FLIGHT", "PHASE_OF_FLT"],
    "height": ["HEIGHT"],
    "damage": ["DAMAGE_LEVEL", "DAMAGE"],
    "species": ["SPECIES"],
    "size": ["SIZE"],
    "cost": ["COST_REPAIRS_INFL_ADJ", "COST_REPAIRS"],
}

PHASE_ORDER = ["Taxi", "Take-off run", "Climb", "En route", "Descent", "Approach", "Landing roll"]
PHASE_FIX = {"take-off run": "Take-off run", "takeoff run": "Take-off run", "en route": "En route",
             "landing roll": "Landing roll", "approach": "Approach", "climb": "Climb",
             "descent": "Descent", "taxi": "Taxi"}
DAMAGE_ORDER = ["N", "M", "M?", "S", "D"]
TOD_ORDER = ["Dawn", "Day", "Dusk", "Night"]

SPECIES_GROUPS = [
    ("Waterfowl", ["goose", "geese", "duck", "swan", "mallard", "teal", "wigeon", "scaup", "brant", "pintail", "coot",
                   "canvasback", "bufflehead", "merganser", "goldeneye", "shoveler", "gadwall", "redhead", "eider", "scoter"]),
    ("Gulls & terns", ["gull", "tern", "kittiwake"]),
    ("Raptors", ["hawk", "eagle", "kite", "vulture", "osprey", "falcon", "kestrel", "owl", "harrier", "merlin"]),
    ("Doves & pigeons", ["dove", "pigeon"]),
    ("Bats", ["bat", "bats", "microbats", "megabats", "myotis", "pipistrelle", "flying fox"]),
    ("Shorebirds", ["killdeer", "plover", "sandpiper", "curlew", "phalarope", "dowitcher", "yellowlegs",
                    "dunlin", "sanderling", "godwit", "turnstone", "willet", "snipe", "woodcock", "lapwing",
                    "shorebird", "golden-plover"]),
    ("Perching birds", ["sparrow", "swallow", "starling", "lark", "blackbird", "warbler", "robin",
                        "meadowlark", "martin", "finch", "swift", "grackle", "thrush", "crow", "raven",
                        "waxwing", "kingbird", "flycatcher", "vireo", "junco", "pipit", "cowbird", "kinglet",
                        "yellowthroat", "bunting", "ovenbird", "nighthawk", "catbird", "mockingbird", "jay",
                        "magpie", "wren", "chickadee", "titmouse", "nuthatch", "oriole", "tanager", "phoebe",
                        "longspur", "bobolink", "dickcissel", "redstart", "waterthrush", "thrasher", "bluebird",
                        "perching birds", "towhee", "cardinal", "grosbeak", "myna", "goldfinch", "siskin"]),
    ("Terrestrial mammals", ["deer", "coyote", "fox", "rabbit", "hare", "skunk", "raccoon", "opossum",
                             "squirrel", "woodchuck", "armadillo", "elk", "moose", "cattle", "dog", "cat",
                             "jackrabbit", "cottontail", "pronghorn", "wapiti", "muskrat", "beaver", "marmot", "prairie dog"]),
]

HEIGHT_BINS = [-1, 0, 500, 1000, 2000, 3000, 4000, 5000, float("inf")]
HEIGHT_LABELS = ["0", "1-500", "501-1,000", "1,001-2,000", "2,001-3,000", "3,001-4,000", "4,001-5,000", "5,001+"]
SIZE_ORDER = ["Small", "Medium", "Large"]
OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"

def list_tables(db: Path) -> list[str]:
    if shutil.which("mdb-tables"):
        out = subprocess.run(["mdb-tables", "-1", str(db)], capture_output=True, text=True, check=True)
        return [t for t in out.stdout.splitlines() if t.strip()]
    from access_parser import AccessParser
    return [t for t in AccessParser(str(db)).catalog if not t.startswith("MSys")]


def read_table(db: Path, table: str) -> pd.DataFrame:
    if shutil.which("mdb-export"):
        out = subprocess.run(["mdb-export", str(db), table], capture_output=True, text=True, check=True)
        return pd.read_csv(io.StringIO(out.stdout), low_memory=False)
    from access_parser import AccessParser
    return pd.DataFrame(AccessParser(str(db)).parse_table(table))


def main_table(db: Path) -> str:
    tables = list_tables(db)
    sizes = {t: len(read_table(db, t)) for t in tables}
    for t, n in sorted(sizes.items(), key=lambda kv: -kv[1]):
        print(f"  {t:40s} {n:>9,} rows")
    return max(sizes, key=sizes.get)


def pick_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = {c.upper(): c for c in df.columns}
    out, missing = {}, []
    for name, options in ALIASES.items():
        src = next((cols[o] for o in options if o in cols), None)
        if src is None:
            missing.append(name)
        else:
            out[name] = df[src]
    if missing:
        print("  note: columns not found ->", ", ".join(missing))
    return pd.DataFrame(out)


def species_group(name) -> str:
    if not isinstance(name, str) or not name.strip():
        return "Unidentified"
    n = name.lower()
    if n.startswith("unknown") or n.startswith("no remains") or n.startswith("no wildlife"):
        return "Unidentified"
    for group, words in SPECIES_GROUPS:
        if any(re.search(rf"\b{re.escape(w)}s?\b", n) for w in words):
            return group
    return "Other"


def clean(df: pd.DataFrame) -> pd.DataFrame:
    d = pick_columns(df)
    d["date"] = pd.to_datetime(d.get("date"), errors="coerce")
    if "year" not in d or d["year"].isna().all():
        d["year"] = d["date"].dt.year
    if "month" not in d or d["month"].isna().all():
        d["month"] = d["date"].dt.month
    d["year"] = pd.to_numeric(d["year"], errors="coerce")
    d["month"] = pd.to_numeric(d["month"], errors="coerce")
    d = d[d["year"].between(YEAR_MIN, YEAR_MAX)].copy()
    if "state" in d:
        d = d[d["state"] != "FN"].copy()

    d["year_month"] = d["year"].astype(int).astype(str) + "-" + d["month"].fillna(1).astype(int).astype(str).str.zfill(2)
    d["phase"] = d["phase"].astype(str).str.strip().str.lower().map(PHASE_FIX)
    d["damage"] = d["damage"].astype(str).str.strip().where(lambda s: s.isin(DAMAGE_ORDER))
    d["damaging"] = d["damage"].isin(["M", "M?", "S", "D"]).astype(float).where(d["damage"].notna())
    d["time_of_day"] = d["time_of_day"].where(d["time_of_day"].isin(TOD_ORDER))
    d["height"] = pd.to_numeric(d["height"], errors="coerce")
    hb = pd.cut(d["height"], HEIGHT_BINS, labels=HEIGHT_LABELS).astype(object)
    d["height_bin"] = hb.where(hb.notna(), "Unknown")
    d["species_group"] = d["species"].map(species_group)
    if "size" in d:
        d["size"] = d["size"].where(d["size"].isin(SIZE_ORDER))
    d["cost"] = pd.to_numeric(d.get("cost"), errors="coerce")
    return d


def airport_coords() -> pd.DataFrame:
    path = OUT / "ourairports.csv"
    if not path.exists():
        print(f"  downloading {OURAIRPORTS_URL}")
        pd.read_csv(OURAIRPORTS_URL, low_memory=False).to_csv(path, index=False)
    oa = pd.read_csv(path, low_memory=False)
    rows = []
    for key in ("ident", "gps_code", "icao_code", "local_code"):
        if key in oa:
            rows.append(oa[[key, "latitude_deg", "longitude_deg"]].rename(columns={key: "airport_id"}))
    coords = pd.concat(rows).dropna(subset=["airport_id"]).drop_duplicates("airport_id")
    return coords.rename(columns={"latitude_deg": "lat", "longitude_deg": "lon"})


def airports(d: pd.DataFrame) -> pd.DataFrame:
    known = d[d["airport_id"].notna() & (d["airport_id"] != "ZZZZ")]
    g = known.groupby(["airport_id", "airport", "state"], dropna=False)
    a = g.agg(strikes=("year", "size"), known_damage=("damaging", "count"), damaging=("damaging", "sum")).reset_index()
    a = a.merge(airport_coords(), on="airport_id", how="left")
    missing = a["lat"].isna()
    print(f"  airports without coordinates: {missing.sum()} of {len(a)} "
          f"({a.loc[missing, 'strikes'].sum():,} strikes) - left off the map")
    a = a[~missing]
    a["pct_damaging"] = (a["damaging"] / a["known_damage"]).round(4)
    a["damaging"] = a["damaging"].astype(int)
    return a.sort_values("strikes", ascending=False)


def summary(d: pd.DataFrame) -> None:
    print(f"\n  rows in scope ({YEAR_MIN}-{YEAR_MAX}): {len(d):,}")
    print("  damage levels:", d["damage"].value_counts(dropna=False).to_dict())
    print("  phases:", d["phase"].value_counts(dropna=False).to_dict())
    print("  species groups:", d["species_group"].value_counts().to_dict())
    if "size" in d:
        print("  % damaging by size:", d.groupby("size")["damaging"].mean().round(3).to_dict())
    known = d["height"].notna()
    print(f"  height known: {known.mean():.0%};  share at/below 500 ft: {(d.loc[known, 'height'] <= 500).mean():.0%}")
    hi, lo = d[d["height"] > 500]["damaging"].mean(), d[d["height"] <= 500]["damaging"].mean()
    print(f"  % damaging above 500 ft: {hi:.1%}  vs at/below: {lo:.1%}   (checks RQ1)")
    unmatched = d.loc[d["species_group"] == "Other", "species"].value_counts().head(15)
    print("  top species in Other (extend SPECIES_GROUPS if needed):\n", unmatched.to_string())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("db", type=Path)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    if not args.db.exists():
        sys.exit(f"File not found: {args.db}")

    OUT.mkdir(exist_ok=True)
    if args.db.suffix.lower() == ".csv":
        print(f"Reading raw CSV export: {args.db}")
        raw = pd.read_csv(args.db, low_memory=False)
    else:
        print("Tables:")
        table = main_table(args.db)
        if args.list:
            sys.exit(0)
        print(f"\nUsing main table: {table}")
        raw = read_table(args.db, table)
        raw.to_csv(OUT / "strikes_raw.csv", index=False)

    d = clean(raw)
    keep = ["id", "year_month", "year", "month", "time_of_day", "airport_id", "state", "phase", "height",
            "height_bin", "damage", "damaging", "species", "species_group", "size", "cost"]
    d[[c for c in keep if c in d]].to_csv(OUT / "strikes_clean.csv", index=False)
    airports(d).to_csv(OUT / "airports.csv", index=False)
    summary(d)
    print(f"\nWrote {OUT/'strikes_clean.csv'}, {OUT/'airports.csv'}"
          + ("" if args.db.suffix.lower() == ".csv" else f", {OUT/'strikes_raw.csv'}"))
