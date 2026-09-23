import csv
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import TwoSlopeNorm

SRC = "./global_temp_dirty_v2.csv"

START, END = pd.Timestamp("1880-01-01"), pd.Timestamp("2025-12-31")
BASE_START, BASE_END = pd.Timestamp("1901-01-01"), pd.Timestamp("2000-12-31")

MISSING_TOKENS = {"", ".", "--", "nan", "null", "na", "n/a", "#n/a", "missing"}
sensorS = {500.0, -500.0, 999.0, -999.0}

MONTHS = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], start=1)}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9

log_lines = []

def log(s=""):
    log_lines.append(s)

def two_digit_year(yy: int) -> int:
    return 1900 + yy if yy >= 26 else 2000 + yy

def month_from_name(name: str):
    return MONTHS.get(name.strip().lower())

def parse_date(s: str):
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    y = m = None
    if re.fullmatch(r"\d{6}", s):
        y, m = int(s[:4]), int(s[4:])
    elif (mt := re.fullmatch(r"(\d{4})[/.\-](\d{1,2})", s)):
        y, m = int(mt[1]), int(mt[2])
    elif (mt := re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)):
        y, m = int(mt[1]), int(mt[2])
    elif (mt := re.fullmatch(r"(\d{1,2})[/\-](\d{4})", s)):
        m, y = int(mt[1]), int(mt[2])
    elif (mt := re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2})", s)):
        m, y = int(mt[1]), two_digit_year(int(mt[3]))
    elif (mt := re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)):
        m, y = int(mt[1]), int(mt[3])
    elif (mt := re.fullmatch(r"([A-Za-z]+)[ \-](\d{4})", s)):
        m, y = month_from_name(mt[1]), int(mt[2])
    elif (mt := re.fullmatch(r"(\d{4})[ \-]([A-Za-z]+)", s)):
        y, m = int(mt[1]), month_from_name(mt[2])
    elif (mt := re.fullmatch(r"([A-Za-z]+)[ \-](\d{2})", s)):
        m, y = month_from_name(mt[1]), two_digit_year(int(mt[2]))
    else:
        return None
    if m is None or not (1 <= m <= 12) or not (1880 <= y <= 2025):
        return None
    return pd.Timestamp(year=y, month=m, day=1)

NUM_RE = re.compile(r"[-+]?(\d+[.,]?\d*|[.,]\d+)")

def parse_value(s: str):
    if s is None:
        return np.nan, False
    t = s.strip()
    if t.lower() in MISSING_TOKENS:
        return np.nan, True
    t = re.sub(r"\s*°\s*C$", "", t, flags=re.I)
    t = t.replace(",", ".")
    if NUM_RE.fullmatch(t):
        return float(t), True
    return np.nan, False

with open(SRC, newline="", encoding="utf-8") as fh:
    raw_rows = list(csv.reader(fh))

header = [h.strip() for h in raw_rows[0]]
body = raw_rows[1:]
n_raw_lines = len(body)

records, swapped, unparsed, nondata = [], [], [], []
for lineno, row in enumerate(body, start=2):
    row = list(row) + [""] * (3 - len(row))

    d_raw, v_raw, note = (c.strip() for c in row[:3])

    if not any((d_raw, v_raw, note)):
        nondata.append((lineno, ",".join(row)))
        continue

    dt = parse_date(d_raw)
    val, ok = parse_value(v_raw)

    if dt is None:
        dt2 = parse_date(v_raw)
        val2, ok2 = parse_value(d_raw)
        if dt2 is not None and ok2:
            swapped.append((lineno, ",".join(row)))
            dt, val, ok = dt2, val2, ok2
        elif dt2 is None and not ok2 and not v_raw:
            nondata.append((lineno, ",".join(row)))
            continue
        else:
            unparsed.append((lineno, ",".join(row)))
            continue
    elif not ok:
        unparsed.append((lineno, ",".join(row)))
        continue

    records.append({"line": lineno, "date": dt, "raw_date": d_raw, "raw_value": v_raw, "anomaly": val})

df = pd.DataFrame(records)
n_parsed = len(df)

log("Cleaning Log:")
log(f"Header (cleaned): {header}")
log(f"Lines after header: {n_raw_lines}")

log()
log(f"Non-data lines discarded: {len(nondata)}")
for ln, txt in nondata:
    log(f"\tline {ln}: {txt}")

log()
log(f"Rows with swapped fields fixed: {len(swapped)}")
for ln, txt in swapped:
    log(f"\tline {ln}: {txt}")
log(f"Rows that could not be parsed : {len(unparsed)}")
for ln, txt in unparsed:
    log(f"\tline {ln}: {txt}")
log(f"Rows parsed: {n_parsed}")
if n_parsed + len(nondata) + len(unparsed) == n_raw_lines:
    log("All rows parsed successfully")
else:
    log("Some rows have problems!!")

log()

n_missing_tokens = int(df["anomaly"].isna().sum())
n_comma = int(df["raw_value"].str.contains(",").sum())
n_degc = int(df["raw_value"].str.contains("°", regex=False).sum())
n_sensor_raw = int(df["anomaly"].isin(sensorS).sum())

log(f"Values with comma decimal: {n_comma}")
log(f"Values with °C suffix: {n_degc}")
log(f"Missing-value tokens to NaN: {n_missing_tokens}")
log(f"sensor codes (±500/±999): {n_sensor_raw}")


df = df.sort_values(["date", "line"]).reset_index(drop=True)
n_out_of_order = int((pd.Series([r["date"] for r in records]).diff().dt.days < 0).sum())

conflicts = []
keep_idx = []
for dt, g in df.groupby("date", sort=True):
    vals = g["anomaly"].dropna().unique()
    if len(vals) > 1:
        conflicts.append((dt.strftime("%Y-%m"), vals.tolist()))
    pref = g[g["anomaly"].notna()]
    keep_idx.append((pref if len(pref) else g).index[0])

dedup = df.loc[keep_idx].set_index("date").sort_index()
n_dupes = n_parsed - len(dedup)
n_exact_dupes = int(df.duplicated(subset=["date", "anomaly"]).sum())

log(f"Out-of-order rows: {n_out_of_order}")
log(f"Duplicate rows removed: {n_dupes}")
if conflicts:
    log("Months with conflicting non-missing duplicates (first kept):")
    for k, v in conflicts:
        log(f"\t{k}: {v}")
else:
    log("No month had two different non-missing values.")
log(f"Unique months present: {len(dedup)}")


x = dedup["anomaly"]
obs = x.dropna()
q1, q3 = obs.quantile(0.25), obs.quantile(0.75)
iqr = q3 - q1
lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
out_mask = (x < lo) | (x > hi)
removed = x[out_mask]
n_out = int(out_mask.sum())
sensors_in_dedup = x.isin(sensorS)
all_sensors_removed = bool((sensors_in_dedup & ~out_mask).sum() == 0)
only_sensors_removed = bool(removed.isin(sensorS).all())
dedup["anomaly_iqr"] = x.mask(out_mask)

log()
log("IQR outlier removal on deduplicated non-missing values:")
log(f"\tn non-missing = {len(obs)}")
log(f"\tQ1 = {q1:.4f}  Q3 = {q3:.4f}  IQR = {iqr:.4f}")
log(f"\tlower fence = {lo:.4f}  upper fence = {hi:.4f}")
log(f"\tvalues removed = {n_out}")
log(f"\tremoved value counts: { {float(k): int(v) for k, v in removed.value_counts().sort_index().items()} }")
log(f"\tevery ±500/±999 code removed : {all_sensors_removed}")
log(f"\tno plausible reading removed : {only_sensors_removed} ")
log()

if all_sensors_removed and only_sensors_removed:
    log("All sensor codes removed")
else:
    log("Some sensors not removed")


grid = pd.date_range(START, END, freq="MS")
s = dedup["anomaly_iqr"].reindex(grid)
n_absent = len(grid) - len(dedup)
n_gap = int(s.isna().sum())
clean = s.interpolate(method="time", limit_direction="both")
if clean.isna().sum() == 0:
    log("All missing values imputed")
else:
    log("Some missing values after imputation")
imputed_mask = s.isna()

log()
log("Imputation:")
log(f"\tmonths on grid 1880-01 to 2025-12 : {len(grid)}")
log(f"\tmonths with no row at all: {n_absent}")
log(f"\tmonths with missing token: {int(dedup['anomaly'].isna().sum())}")
log(f"\tmonths removed as outliers: {n_out}")
log(f"\ttotal months imputed (linear interpolation): {n_gap}")



mu20 = clean[BASE_START:BASE_END].mean()
mu, sigma = clean.mean(), clean.std(ddof=1)
d = clean - mu20
z = (clean - mu) / sigma
log()
log("Normalization:")
log(f"\tmu_20 (1901-2000 mean) = {mu20:+.4f} °C")
log(f"\tmu (1880-2025 mean) = {mu:+.4f} °C")
log(f"\tsigma (1880-2025 standard deviation) = {sigma:.4f} °C")


annual = pd.DataFrame({"anomaly": clean, "z": z}).groupby(clean.index.year).agg(
    mean_anomaly=("anomaly", "mean"), mean_z=("z", "mean"), n=("anomaly", "size"))


top5 = annual.sort_values("mean_anomaly", ascending=False).head(5)
log()
log("Five Warmest Years:")
for rank, (yr, r) in enumerate(top5.iterrows(), start=1):
    log(f"\t{rank}. {yr}: mean anomaly {r.mean_anomaly:+.3f} °C, mean z {r.mean_z:+.3f}")


out = pd.DataFrame({"date": clean.index.strftime("%Y-%m"), "anomaly_c": clean.round(5).values, "z": z.round(5).values})

plt.rcParams.update({"font.size": 8, "axes.linewidth": 0.6, "xtick.major.width": 0.5, "ytick.major.width": 0.5})

t = matplotlib.dates.date2num(clean.index.to_pydatetime())
y = clean.values
pts = np.column_stack([t, y]).reshape(-1, 1, 2)
segs = np.concatenate([pts[ : np.shape(pts)[0] - 1], pts[1:]], axis=1)
seg_d = 0.5 * (d.values[ : np.shape(d.values)[0] - 1] + d.values[1:])
lim = float(np.abs(d).max())
norm = TwoSlopeNorm(vmin=-lim, vcenter=0.0, vmax=lim)

fig, ax = plt.subplots(figsize=(7.16, 1.6))
lc = LineCollection(segs, cmap="RdBu_r", norm=norm, linewidths=0.9, capstyle="round")
lc.set_array(seg_d)
ax.add_collection(lc)
ax.axhline(mu20, color="#000000", lw=0.6, zorder=0)
ax.text(matplotlib.dates.date2num(pd.Timestamp("1881-01-01")), mu20 + 0.04, f"1901-2000 baseline ($\\mu_{{20}}$ = {mu20:+.4f} °C)", fontsize=6.5, color="#555555", va="bottom")
ax.set_xlim(t[0], t[-1])
pad = 0.1
ax.set_ylim(y.min() - pad, y.max() + pad)
ax.xaxis.set_major_locator(matplotlib.dates.YearLocator(20))
ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%Y"))
ax.set_xlabel("Year")
ax.set_ylabel("Anomaly (°C)")
ax.grid(axis="y", color="#dddddd", lw=0.4)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
cb = fig.colorbar(lc, ax=ax, pad=0.015, fraction=0.035)
cb.set_label("$d = x - \\mu_{20}$ (°C)")
cb.outline.set_linewidth(0.5)
ax.set_title("Monthly global temperature anomaly, 1880-2025 (cleaned)", fontsize=8.5, loc="left")
fig.tight_layout(pad=0.4)
fig.savefig("./anomaly_chart.png", dpi=300)
plt.close(fig)

with open("./cleaning_log.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(log_lines))
out.to_csv("./cleaned_monthly.csv", index=False)

print("Wrote cleaned_monthly.csv, cleaning_log.txt, anomaly_chart.png")