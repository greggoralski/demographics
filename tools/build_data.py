#!/usr/bin/env python3
"""Build data/data.js for the Demographics made Sculptural site.

Usage:
    python3 tools/build_data.py RAW_DIR

RAW_DIR holds the downloaded source files (see tools/README.md for the list
and where each one comes from). Nothing here is modelled or invented: every
number is read from a published table, and anything derived (shares, growth
rates, inflation adjustment) is derived from those tables only.
"""
import csv
import json
import math
import os
import sys

RAW = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "data.js")

Y0, Y1 = 1990, 2050          # years shown on the site
SERIES_FROM = 1921           # yearly indicators reach back further, for older lives
MAX_AGE = 100                # last row is "100 and over"
SCENARIO = "M1"              # Statistics Canada medium-growth projection


def rows(table):
    path = os.path.join(RAW, table, table + ".csv")
    return csv.DictReader(open(path, encoding="utf-8-sig"))


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def single_age(label):
    """'0 years' / '1 year' / 'Under 1 year' / '37 years' -> int, else None."""
    if label == "Under 1 year":
        return 0
    parts = label.split()
    if len(parts) == 2 and parts[1] in ("year", "years") and parts[0].isdigit():
        return int(parts[0])
    return None


# ---------------------------------------------------------------- population
pop = {}        # year -> list of 101 values (persons)
open90 = {}     # year -> "90 and over" total, for years with no single ages there
last_estimate = 0

# 1921-1970: table 17-10-0029-01 (thousands; single ages to 69, then five-year
# groups 70-74 ... 85-89, then 90+)
GROUPS = {"70-74 years": 70, "75-79 years": 75, "80-84 years": 80, "85-89 years": 85}
grouped = {}    # year -> {70: total, 75: total, ...}
for r in rows("17100029"):
    if r["GEO"] != "Canada" or r["Sex"] != "Both sexes":
        continue
    y = int(r["REF_DATE"])
    if y >= 1971:
        continue
    v = num(r["VALUE"])
    if v is None:
        continue
    a = single_age(r["Age group"])
    if a is not None and a <= 69:
        pop.setdefault(y, [None] * (MAX_AGE + 1))[a] = v * 1000
    elif r["Age group"] in GROUPS:
        grouped.setdefault(y, {})[GROUPS[r["Age group"]]] = v * 1000
    elif r["Age group"] == "90 years and over":
        open90[y] = v * 1000

# 1971-latest: table 17-10-0005-01 (persons, single ages to 99, then 100+)
for r in rows("17100005"):
    if r["GEO"] != "Canada" or r["Gender"] != "Total - gender":
        continue
    y = int(r["REF_DATE"])
    v = num(r["VALUE"])
    if v is None:
        continue
    a = single_age(r["Age group"])
    label = r["Age group"]
    if a is not None and a <= 99:
        pop.setdefault(y, [None] * (MAX_AGE + 1))[a] = v
        last_estimate = max(last_estimate, y)
    elif label == "100 years and older":
        pop.setdefault(y, [None] * (MAX_AGE + 1))[100] = v
    elif label == "90 years and older":
        open90[y] = v

# Split "90 and over" into single ages where the source gives only the total,
# using the age pattern of the first year that does have single ages.
ref_year = min(y for y in pop if pop[y][90] is not None and pop[y][100] is not None)
ref_tail = pop[ref_year][90:]
ref_sum = sum(ref_tail)
split_years = []
for y in sorted(pop):
    if pop[y][90] is None:
        split_years.append(y)
        for k, share in enumerate(ref_tail):
            pop[y][90 + k] = open90[y] * share / ref_sum

# Projections: table 17-10-0057-01 (thousands), after the last estimate.
proj_total = {}
for r in rows("17100057"):
    if r["GEO"] != "Canada" or r["Gender"] != "Total - gender":
        continue
    if not r["Projection scenario"].startswith("Projection scenario " + SCENARIO):
        continue
    y = int(r["REF_DATE"])
    v = num(r["VALUE"])
    if v is None:
        continue
    if r["Age group"] == "All ages":
        proj_total[y] = v * 1000
    if y <= last_estimate or y > Y1:
        continue
    a = single_age(r["Age group"])
    if a is not None and a <= 99:
        pop.setdefault(y, [None] * (MAX_AGE + 1))[a] = v * 1000
    elif r["Age group"] == "100 years and over":
        pop.setdefault(y, [None] * (MAX_AGE + 1))[100] = v * 1000

# Split the pre-1971 five-year groups (70-89) into single ages: draw a smooth
# curve through the group averages, then scale each group back to its
# published total, so the totals are untouched.
for y, g in grouped.items():
    col = pop[y]
    xs = [67, 72, 77, 82, 87, 92]
    ms = [sum(col[65:70]) / 5.0] + [g[a] / 5.0 for a in (70, 75, 80, 85)] + [sum(col[90:95]) / 5.0]
    for start in (70, 75, 80, 85):
        est = []
        for a in range(start, start + 5):
            i = max(k for k in range(5) if xs[k] <= a)
            t = (a - xs[i]) / 5.0
            est.append(math.exp(math.log(ms[i]) * (1 - t) + math.log(ms[i + 1]) * t))
        scale = g[start] / sum(est)
        for k, v in enumerate(est):
            col[start + k] = v * scale

years = list(range(Y0, Y1 + 1))
for y in years:
    assert y in pop and all(v is not None for v in pop[y]), "population gap in %d" % y
grid = [[int(round(v)) for v in pop[y]] for y in years]


def median_age(col):
    half, run = sum(col) / 2.0, 0.0
    for a, v in enumerate(col):
        if run + v >= half:
            return a + (half - run) / v
        run += v
    return float(MAX_AGE)


total, u20, work, s65, med, growth, prime = {}, {}, {}, {}, {}, {}, {}
for y, col in zip(years, grid):
    t = float(sum(col))
    total[y] = int(t)
    u20[y] = round(100 * sum(col[:20]) / t, 1)
    work[y] = round(100 * sum(col[20:65]) / t, 1)
    prime[y] = round(100 * sum(col[25:55]) / t, 1)
    s65[y] = round(100 * sum(col[65:]) / t, 1)
    med[y] = round(median_age(col), 1)
for y in years[1:]:
    # at the join, compare the projection with its own previous year
    prev = proj_total.get(y - 1, total[y - 1]) if y == last_estimate + 1 else total[y - 1]
    growth[y] = round(100.0 * (total[y] - prev) / prev, 2)

# ------------------------------------------------------------ yearly series
# Fertility: OWID long-run series to 1990, Statistics Canada 13-10-0418-01 after.
tfr = {}
for r in csv.DictReader(open(os.path.join(RAW, "ext", "owid_tfr.csv"), encoding="utf-8-sig")):
    if r["code"] == "CAN":
        tfr[int(r["year"])] = round(float(r["fertility_rate_hist"]), 2)
for r in rows("13100418"):
    if r["GEO"].startswith("Canada") and r["Characteristics"] == "Total fertility rate per female":
        v = num(r["VALUE"])
        if v is not None:
            tfr[int(r["REF_DATE"])] = round(v, 2)

# Immigration: Statistics Canada "150 years of immigration" to 1971, then the
# Immigrants component of table 17-10-0008-01 (July-June years, filed under
# the year they end in). Shown per 1,000 residents.
imm_n = {}
for r in csv.DictReader(open(os.path.join(HERE, "immigration_1915_2014.csv"))):
    y = int(r["year"])
    if y <= 1971:
        imm_n[y] = float(r["immigrants"])
for r in rows("17100008"):
    if r["GEO"] == "Canada" and r["Components of population growth"] == "Immigrants":
        v = num(r["VALUE"])
        if v is not None:
            imm_n[int(r["REF_DATE"].split("/")[1])] = v
imm = {y: round(1000.0 * n / total[y], 1) for y, n in imm_n.items() if y in total}

# GDP growth: Maddison Project real GDP to 1960, World Bank real growth after.
gdp = {}
level = {}
for r in csv.DictReader(open(os.path.join(RAW, "ext", "owid_gdp_can.csv"), encoding="utf-8-sig")):
    if r["code"] == "CAN":
        level[int(r["year"])] = float(r["gdp"])
for y in range(SERIES_FROM, 1961):
    if y in level and y - 1 in level:
        gdp[y] = round(100.0 * (level[y] / level[y - 1] - 1), 1)
for o in json.load(open(os.path.join(RAW, "ext", "wb_gdp.json")))[1]:
    if o["value"] is not None:
        gdp[int(o["date"])] = round(o["value"], 1)

# Consumer prices (all-items, 2002=100), for adjusting tuition for inflation.
cpi = {}
for r in rows("18100005"):
    if r["GEO"] == "Canada" and r["Products and product groups"] == "All-items" and r["UOM"] == "2002=100":
        v = num(r["VALUE"])
        if v is not None:
            cpi[int(r["REF_DATE"])] = v
cpi_year = max(cpi)

# Tuition: average Canadian undergraduate fees. 37-10-0150-01 (1972-2005) and
# 37-10-0045-01 (2006 on). An academic year is filed under the year it starts.
tuition_nominal = {}
for r in rows("37100150"):
    if r["GEO"] == "Canada" and r["Field of study"] == "Total, field of study":
        v = num(r["VALUE"])
        if v is not None:
            tuition_nominal[int(r["REF_DATE"][:4])] = v
for r in rows("37100045"):
    if r["GEO"] == "Canada" and r["Level of study"] == "Canadian undergraduate":
        v = num(r["VALUE"])
        if v is not None:
            tuition_nominal[int(r["REF_DATE"][:4])] = v
tuition = {}
for y, v in tuition_nominal.items():
    base = cpi.get(y, cpi[cpi_year])       # newest years: no annual CPI yet
    tuition[y] = int(round(v * cpi[cpi_year] / base, -1))

# House prices: BIS real (inflation-adjusted) residential property price index,
# quarterly, averaged by year and rebased so the latest full year = 100.
quarters = {}
for r in csv.DictReader(open(os.path.join(RAW, "ext", "bis.csv"))):
    v = num(r["OBS_VALUE"])
    if v is not None:
        quarters.setdefault(int(r["TIME_PERIOD"][:4]), []).append(v)
full = {y: sum(q) / 4 for y, q in quarters.items() if len(q) == 4}
house_year = max(full)
house = {y: round(100 * v / full[house_year], 1) for y, v in full.items()}

# Unemployment rate by age group: table 14-10-0327-01.
UN_GROUPS = ["15 to 19 years", "20 to 24 years", "25 to 29 years", "30 to 34 years",
             "35 to 39 years", "40 to 44 years", "45 to 49 years", "50 to 54 years",
             "55 to 59 years", "60 to 64 years", "65 years and over"]
unemp = {g: {} for g in UN_GROUPS}
for r in rows("14100327"):
    if (r["GEO"] == "Canada" and r["Labour force characteristics"] == "Unemployment rate"
            and r["Gender"] == "Total - Gender" and r["Age group"] in unemp):
        v = num(r["VALUE"])
        if v is not None:
            unemp[r["Age group"]][int(r["REF_DATE"])] = v

# Median total income by age group, constant dollars: table 11-10-0239-01.
INC_GROUPS = ["15 to 24 years", "25 to 34 years", "35 to 44 years",
              "45 to 54 years", "55 to 64 years", "65 years and over"]
income = {g: {} for g in INC_GROUPS}
income_dollars = ""
for r in rows("11100239"):
    if (r["GEO"] == "Canada" and r["Income source"] == "Total income"
            and r["Statistics"] == "Median income (excluding zeros)"
            and r["Gender"] == "Total - Gender" and r["Age group"] in income):
        v = num(r["VALUE"])
        if v is not None:
            income[r["Age group"]][int(r["REF_DATE"])] = int(v)
            income_dollars = r["UOM"]

# University degree, share of 25-54 year olds: table 14-10-0118-01.
edu_n = {}
for r in rows("14100118"):
    if (r["GEO"] == "Canada" and r["Labour force characteristics"] == "Population"
            and r["Gender"] == "Total - Gender" and r["Age group"] == "25 to 54 years"
            and r["Educational degree"] in ("University degree", "Total, all education levels")):
        v = num(r["VALUE"])
        if v is not None:
            edu_n.setdefault(int(r["REF_DATE"]), {})[r["Educational degree"]] = v
uni = {y: round(100 * d["University degree"] / d["Total, all education levels"], 1)
       for y, d in edu_n.items() if len(d) == 2}

# Mean age at first marriage: table 39-10-0056-01.
marriage = {}
for r in rows("39100056"):
    if (r["GEO"] == "Canada" and r["Legal marital status prior to marriage"] == "Never legally married"
            and r["Gender"].startswith("Total") and r["Gender composition of the couple"].startswith("Total")
            and r["Indicator"] == "Mean age at marriage"):
        v = num(r["VALUE"])
        if v is not None:
            marriage[int(r["REF_DATE"])] = v

# Young adults (20-34) living with at least one parent: census years only.
# Statistics Canada, The Daily, 13 July 2022, chart 5.
with_parents = {2001: 30.6, 2006: 33.1, 2011: 33.7, 2016: 35.1, 2021: 35.1}

# Share of household spending on shelter and food: table 11-10-0222-01
# (Survey of Household Spending; not run every year).
spend = {}
for r in rows("11100222"):
    if r["GEO"] == "Canada" and r["Statistic"] == "Average expenditure per household":
        v = num(r["VALUE"])
        if v is not None:
            spend.setdefault(int(r["REF_DATE"]), {})[r["Household expenditures, summary-level categories"]] = v
shelter = {y: round(100 * d["Shelter"] / d["Total current consumption"], 1)
           for y, d in spend.items() if "Shelter" in d and "Total current consumption" in d}
food = {y: round(100 * d["Food expenditures"] / d["Total current consumption"], 1)
        for y, d in spend.items() if "Food expenditures" in d and "Total current consumption" in d}

# ---------------------------------------------------- age-specific extras
# Mean age of mother at delivery, all live births: table 13-10-0417-01.
# (Statistics Canada publishes no national series for first births only.)
mother_age = {}
for r in rows("13100417"):
    if r["GEO"].startswith("Canada"):
        v = num(r["VALUE"])
        if v is not None:
            mother_age[int(r["REF_DATE"])] = v

# Fertility rate by age of mother, births per 1,000 women: table 13-10-0418-01.
fert = {}
for r in rows("13100418"):
    c = r["Characteristics"]
    if r["GEO"].startswith("Canada") and c.startswith("Age-specific fertility rate, females "):
        v = num(r["VALUE"])
        if v is not None:
            fert.setdefault(c.split("females ")[1], {})[int(r["REF_DATE"])] = v

# Remaining life expectancy at each single age: table 13-10-0837-01.
life = {}
for r in rows("13100837"):
    if (r["GEO"] == "Canada" and r["Sex"] == "Both sexes"
            and r["Element"].startswith("Life expectancy")):
        a, v, y = single_age(r["Age group"]), num(r["VALUE"]), int(r["REF_DATE"])
        if a is not None and a <= MAX_AGE and v is not None and y >= Y0:
            life.setdefault(y, [None] * (MAX_AGE + 1))[a] = round(v, 1)
life_years = sorted(life)

# Share attending school, college or university, single ages 15 to 29:
# table 37-10-0101-01. An academic year is filed under the year it starts.
school = {}
for r in rows("37100101"):
    if r["Type of institution attended"] == "Total type of institution attended":
        v = num(r["VALUE"])
        if v is not None:
            school.setdefault(int(r["REF_DATE"][:4]), {})[int(r["Age"].split()[0])] = v
school_years = list(range(min(school), max(school) + 1))     # the survey skips some years

# University degree by age group: table 14-10-0118-01 again, all age groups.
deg_n = {}
for r in rows("14100118"):
    if (r["GEO"] == "Canada" and r["Labour force characteristics"] == "Population"
            and r["Gender"] == "Total - Gender"
            and r["Age group"] in ("15 to 24 years", "25 to 54 years", "55 to 64 years", "65 years and over")
            and r["Educational degree"] in ("University degree", "Total, all education levels")):
        v = num(r["VALUE"])
        if v is not None:
            deg_n.setdefault(r["Age group"], {}).setdefault(int(r["REF_DATE"]), {})[r["Educational degree"]] = v
degree = {g: {y: round(100 * d["University degree"] / d["Total, all education levels"], 1)
              for y, d in ys.items() if len(d) == 2} for g, ys in deg_n.items()}

# Living alone, and living with one's own children, by age group, from the
# 2011, 2016 and 2021 censuses: table 98-10-0134-01. "With children" counts
# spouses and partners in couple-with-children households plus lone parents;
# parents in multigenerational or shared households are not separable.
alone, with_kids = {}, {}
cen = {}
for r in rows("98100134"):
    if r["GEO"] != "Canada" or not r["Gender (3a)"].startswith("Total"):
        continue
    tot_col = [k for k in r if k.endswith("[1]")][0]
    kids_col = [k for k in r if k.endswith("[4]")][0]
    key = (r["Age group (11)"], int(r["Census year (3)"]))
    cen.setdefault(key, {})[r["Census family status and household living arrangements (11)"]] = (
        num(r[tot_col]), num(r[kids_col]))
for (group, year), d in cen.items():
    if group.startswith("Total"):
        continue
    everyone = d["Total - Census family status and household living arrangements"][0]
    alone.setdefault(group, {})[year] = round(100 * d["Persons living alone"][0] / everyone, 1)
    with_kids.setdefault(group, {})[year] = round(
        100 * (d["Married spouses and common-law partners"][1] + d["Parents in one-parent families"][0]) / everyone, 1)

# Born outside Canada (immigrants plus non-permanent residents) by age group,
# 2021 Census: table 98-10-0347-01.
foreign = {}
for r in rows("98100347"):
    if r["GEO"] == "Canada" and r["Gender (3)"].startswith("Total") and r["Statistics (2)"] == "2021 Counts":
        tot = num(r[[k for k in r if k.endswith("[1]")][0]])
        imm_c = num(r[[k for k in r if k.endswith("Immigrants[3]")][0]])
        npr = num(r[[k for k in r if k.endswith("[9]")][0]])
        foreign[r["Age (15C)"]] = round(100 * (imm_c + npr) / tot, 1)

# A well-known Canadian born in each year (tools/famous.csv: chosen from
# Wikidata's most widely covered Canadians per birth year, lightly curated).
def famous_for(code):
    path = os.path.join(HERE, "famous_%s.csv" % code)
    return {int(r["year"]): [r["name"], r["role"]]
            for r in csv.DictReader(open(path, encoding="utf-8"))}


famous = famous_for("CA")

# Recessions: C.D. Howe Institute Business Cycle Council (Cross & Bergevin
# 2012, plus the Council's 2020 call). [start, end] as year + month/12;
# "deep" marks the ones the Council ranks in its two most severe categories.
def ym(y, m):
    return round(y + (m - 1) / 12.0, 3)

recessions = [
    {"s": ym(1929, 4), "e": ym(1933, 2), "name": "the Great Depression", "deep": True},
    {"s": ym(1937, 11), "e": ym(1938, 6), "name": "the 1937-38 recession", "deep": False},
    {"s": ym(1947, 8), "e": ym(1948, 3), "name": "the 1947-48 recession", "deep": False},
    {"s": ym(1951, 4), "e": ym(1951, 12), "name": "the 1951 recession", "deep": False},
    {"s": ym(1953, 7), "e": ym(1954, 7), "name": "the 1953-54 recession", "deep": True},
    {"s": ym(1957, 3), "e": ym(1958, 1), "name": "the 1957-58 recession", "deep": False},
    {"s": ym(1960, 3), "e": ym(1961, 3), "name": "the 1960-61 recession", "deep": False},
    {"s": ym(1974, 12), "e": ym(1975, 3), "name": "the 1975 recession", "deep": False},
    {"s": ym(1980, 1), "e": ym(1980, 6), "name": "the 1980 recession", "deep": False},
    {"s": ym(1981, 6), "e": ym(1982, 10), "name": "the 1981-82 recession", "deep": True},
    {"s": ym(1990, 3), "e": ym(1992, 4), "name": "the early-1990s recession", "deep": True},
    {"s": ym(2008, 10), "e": ym(2009, 5), "name": "the 2008-09 financial crisis", "deep": True},
    {"s": ym(2020, 2), "e": ym(2020, 4), "name": "the COVID-19 recession", "deep": True},
]

# ------------------------------------------------------------------- output
def series(d):
    """dict year -> value  =>  {start, values[]} with nulls for gaps."""
    ys = sorted(y for y in d if SERIES_FROM <= y <= Y1)
    return {"start": ys[0], "values": [d.get(y) for y in range(ys[0], ys[-1] + 1)]}


# ---------------------------------------------------- workers per non-worker
# People in work for each person not in work (children, students, people out
# of work, the retired). Each age band's population is multiplied by the share
# of that band in work. Rates are measured to WORK_TO; later years hold the
# WORK_TO rates, so only the age mix changes.
WORK_TO = 2025


def held(d, y):
    """Value for year y, or the nearest measured year, never after WORK_TO."""
    ys = [k for k in d if k <= WORK_TO]
    return d[min(max(y, min(ys)), max(ys))]


def per_non_worker(g, employed):
    out = {}
    for y, col in zip(years, g):
        e = employed(y, col)
        out[y] = round(e / (sum(col) - e), 2)
    return out


# Canada: employment rate by five-year age group, table 14-10-0327-01.
EMP_BANDS = [(a, a + 4, "%d to %d years" % (a, a + 4)) for a in range(15, 70, 5)] + [(70, MAX_AGE, "70 years and over")]
emp_rate = {label: {} for _, _, label in EMP_BANDS}
for r in rows("14100327"):
    if (r["GEO"] == "Canada" and r["Labour force characteristics"] == "Employment rate"
            and r["Gender"] == "Total - Gender" and r["Age group"] in emp_rate):
        v = num(r["VALUE"])
        if v is not None:
            emp_rate[r["Age group"]][int(r["REF_DATE"])] = v
ca_workers = per_non_worker(grid, lambda y, col: sum(
    sum(col[lo:hi + 1]) * held(emp_rate[label], y) / 100 for lo, hi, label in EMP_BANDS))

# Elsewhere: International Labour Organization modelled estimates. The share
# in work is the participation rate (15-24, 25-54, 55-64, 65+) less the
# unemployed (rates for 15-24 and 25+). RAW/ilo holds the two SDMX downloads.
ILO_BANDS = [(15, 24, "Y15-24", "Y15-24"), (25, 54, "Y25-54", "YGE25"),
             (55, 64, "Y55-64", "YGE25"), (65, MAX_AGE, "YGE65", "YGE25")]
ilo = {"EAP": {}, "UNE": {}}
for kind, name, prefix in (("EAP", "EAP_2WAP_SEX_AGE_RT", "AGE_AGGREGATE_"), ("UNE", "UNE_2EAP_SEX_AGE_RT", "AGE_YTHADULT_")):
    for r in csv.DictReader(open(os.path.join(RAW, "ilo", name + ".csv"))):
        if r["AGE"].startswith(prefix) and r["SEX"] == "SEX_T":
            ilo[kind].setdefault((r["REF_AREA"], r["AGE"][len(prefix):]), {})[int(r["TIME_PERIOD"])] = float(r["OBS_VALUE"])


def ilo_employed(code, y, col):
    return sum(sum(col[lo:hi + 1]) * held(ilo["EAP"][(code, b)], y) / 100
               * (1 - held(ilo["UNE"][(code, ub)], y) / 100) for lo, hi, b, ub in ILO_BANDS)


data = {
    "name": "Canada", "label": "Canada", "generations": "statcan", "indicatorsTo": last_estimate,
    "y0": Y0, "y1": Y1, "maxAge": MAX_AGE,
    "lastEstimate": last_estimate,
    "splitTailUntil": max(split_years), "splitTailRef": ref_year,
    "cpiYear": cpi_year, "houseYear": house_year, "incomeDollars": income_dollars,
    "pop": grid,
    "total": series(total), "under20": series(u20), "working": series(work), "prime": series(prime),
    "workers": series(ca_workers), "workRatesTo": WORK_TO,
    "over65": series(s65), "medianAge": series(med), "growth": series(growth),
    "tfr": series(tfr), "immigration": series(imm), "gdp": series(gdp),
    "tuition": series(tuition), "house": series(house),
    "university": series(uni), "marriage": series(marriage),
    "shelter": series(shelter), "food": series(food),
    "motherAge": series(mother_age),
    "fertility": {g: series(v) for g, v in fert.items()},
    "degree": {g: series(v) for g, v in degree.items()},
    "lifeExp": {"start": life_years[0], "values": [life[y] for y in life_years]},
    "school": {"start": school_years[0], "ages": [15, 29],
               "values": [[school.get(y, {}).get(a) for a in range(15, 30)] for y in school_years]},
    "alone": alone, "withKids": with_kids, "foreign": foreign,
    "famous": famous,
    "unemployment": {g: series(v) for g, v in unemp.items()},
    "income": {g: series(v) for g, v in income.items()},
    "withParents": with_parents,
    "recessions": recessions,
}

# ------------------------------------------------- United States, China, EU
# Population by single age: UN World Population Prospects 2024 (thousands;
# counts to 2023, medium projection after). RAW/wpp/subset.csv holds the rows
# for the countries needed, cut from the two UN "PopulationBySingleAgeSex"
# files. The EU is the sum of its 27 member states.
EU27 = ("AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU "
        "LUX MLT NLD POL PRT ROU SVK SVN ESP SWE").split()
WPP_LAST_COUNT = 2023
wpp = {}
for r in csv.DictReader(open(os.path.join(RAW, "wpp", "subset.csv"))):
    key = (r["iso3"], int(r["year"]))
    wpp.setdefault(key, [0.0] * (MAX_AGE + 1))[min(MAX_AGE, int(r["age"]))] += float(r["pop_thousands"]) * 1000


def wpp_grid(codes):
    out = []
    for y in years:
        col = [0.0] * (MAX_AGE + 1)
        for code in codes:
            for a, v in enumerate(wpp[(code, y)]):
                col[a] += v
        out.append([int(round(v)) for v in col])
    return out


def derived(g):
    t_, u_, w_, s_, m_, gr_, p_ = {}, {}, {}, {}, {}, {}, {}
    for y, col in zip(years, g):
        t = float(sum(col))
        t_[y] = int(t)
        u_[y] = round(100 * sum(col[:20]) / t, 1)
        w_[y] = round(100 * sum(col[20:65]) / t, 1)
        p_[y] = round(100 * sum(col[25:55]) / t, 1)
        s_[y] = round(100 * sum(col[65:]) / t, 1)
        m_[y] = round(median_age(col), 1)
    for y in years[1:]:
        gr_[y] = round(100.0 * (t_[y] - t_[y - 1]) / t_[y - 1], 2)
    return {"total": series(t_), "under20": series(u_), "working": series(w_), "prime": series(p_),
            "over65": series(s_), "medianAge": series(m_), "growth": series(gr_)}


# Yearly indicators: World Bank (the EU is its own aggregate there, "EUU").
WB = {"gdp": "NY.GDP.MKTP.KD.ZG", "tfr": "SP.DYN.TFRT.IN", "lifeBirth": "SP.DYN.LE00.IN",
      "youthUnemp": "SL.UEM.1524.ZS", "tertiary": "SE.TER.ENRR", "urban": "SP.URB.TOTL.IN.ZS"}
wb = {}
for field, code in WB.items():
    path = os.path.join(RAW, "wb", code + ".json")
    if not os.path.exists(path):
        print(" (no World Bank file for %s; skipped)" % field)
        continue
    try:
        records = json.load(open(path))[1]
    except (ValueError, IndexError):
        print(" (World Bank file for %s is unreadable; skipped)" % field)
        continue
    for o in records:
        if o["value"] is not None:
            wb.setdefault((o["countryiso3code"], field), {})[int(o["date"])] = round(o["value"], 2)

# US recessions: National Bureau of Economic Research business cycle dates.
us_recessions = [
    {"s": ym(1929, 8), "e": ym(1933, 3), "name": "the Great Depression", "deep": True},
    {"s": ym(1937, 5), "e": ym(1938, 6), "name": "the 1937-38 recession", "deep": True},
    {"s": ym(1945, 2), "e": ym(1945, 10), "name": "the 1945 recession", "deep": False},
    {"s": ym(1948, 11), "e": ym(1949, 10), "name": "the 1949 recession", "deep": False},
    {"s": ym(1953, 7), "e": ym(1954, 5), "name": "the 1953-54 recession", "deep": False},
    {"s": ym(1957, 8), "e": ym(1958, 4), "name": "the 1958 recession", "deep": False},
    {"s": ym(1960, 4), "e": ym(1961, 2), "name": "the 1960-61 recession", "deep": False},
    {"s": ym(1969, 12), "e": ym(1970, 11), "name": "the 1970 recession", "deep": False},
    {"s": ym(1973, 11), "e": ym(1975, 3), "name": "the 1973-75 recession", "deep": True},
    {"s": ym(1980, 1), "e": ym(1980, 7), "name": "the 1980 recession", "deep": False},
    {"s": ym(1981, 7), "e": ym(1982, 11), "name": "the 1981-82 recession", "deep": True},
    {"s": ym(1990, 7), "e": ym(1991, 3), "name": "the 1990-91 recession", "deep": False},
    {"s": ym(2001, 3), "e": ym(2001, 11), "name": "the 2001 recession", "deep": False},
    {"s": ym(2007, 12), "e": ym(2009, 6), "name": "the Great Recession", "deep": True},
    {"s": ym(2020, 2), "e": ym(2020, 4), "name": "the COVID-19 recession", "deep": True},
]


def other(code, name, label, generations, wpp_codes, wb_code, recessions):
    g = wpp_grid(wpp_codes)
    d = {"name": name, "label": label, "generations": generations,
         "y0": Y0, "y1": Y1, "maxAge": MAX_AGE, "lastEstimate": WPP_LAST_COUNT,
         "pop": g, "famous": famous_for(code)}
    d.update(derived(g))
    employed = {y: sum(ilo_employed(c, y, wpp[(c, y)]) for c in wpp_codes) for y in years}
    d["workers"] = series({y: round(employed[y] / (sum(col) - employed[y]), 2) for y, col in zip(years, g)})
    d["workRatesTo"] = WORK_TO
    last = WPP_LAST_COUNT
    for field in WB:
        if (wb_code, field) in wb:
            d[field] = series(wb[(wb_code, field)])
            last = max(last, max(wb[(wb_code, field)]))
    d["indicatorsTo"] = max(last, last_estimate)
    if recessions is not None:
        d["recessions"] = recessions
    print(" %-3s total 1990 %6.1fM  2026 %6.1fM  2050 %6.1fM  65+ %s -> %s  indicators: %s"
          % (code, sum(g[0]) / 1e6, sum(g[2026 - Y0]) / 1e6, sum(g[-1]) / 1e6,
             d["over65"]["values"][0], d["over65"]["values"][-1],
             ", ".join(f for f in WB if f in d)))
    return d


countries = {
    "CA": data,
    "US": other("US", "the United States", "United States", "pew", ["USA"], "USA", us_recessions),
    "CN": other("CN", "China", "China", "decade", ["CHN"], "CHN", None),
    "EU": other("EU", "the European Union", "European Union", "common", EU27, "EUU", None),
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write("/* Generated by tools/build_data.py. Do not edit by hand. */\n")
    f.write("window.DEMO_DATA = ")
    json.dump({"order": ["CA", "US", "CN", "EU"], "countries": countries}, f, separators=(",", ":"))
    f.write(";\n")

# ---------------------------------------------------------------- diagnostics
print("years %d-%d, last estimate %d, 90+ split until %d using %d pattern"
      % (Y0, Y1, last_estimate, max(split_years), ref_year))
for y in (1990, 2000, 2026, 2027, 2050):
    print(" %d  total %5.2fM  <20 %4.1f%%  20-64 %4.1f%%  65+ %4.1f%%  median %4.1f  age0 %6d  age20 %6d  age60 %6d"
          % (y, total[y] / 1e6, u20[y], work[y], s65[y], med[y],
             pop[y][0], pop[y][20], pop[y][60]))
for name, d in (("tfr", tfr), ("imm/1000", imm), ("gdp", gdp), ("tuition", tuition),
                ("house", house), ("uni", uni), ("marriage", marriage)):
    ys = sorted(y for y in d if y >= SERIES_FROM)
    print(" %-9s %d-%d  first %s  last %s  gaps %d"
          % (name, ys[0], ys[-1], d[ys[0]], d[ys[-1]],
             sum(1 for y in range(ys[0], ys[-1] + 1) if y not in d)))
print(" motherAge", min(mother_age), mother_age[min(mother_age)], max(mother_age), mother_age[max(mother_age)])
print(" fertility", {g: v.get(2000) for g, v in fert.items()})
print(" lifeExp", life_years[0], life_years[-1], [life[2000][a] for a in (0, 20, 65, 90, 100)], life_years == list(range(life_years[0], life_years[-1] + 1)))
print(" school", school_years[0], school_years[-1], [school[2010].get(a) for a in (15, 18, 20, 25, 29)], sorted(set(school_years) - set(school)))
print(" degree", {g: (min(v), v.get(2025)) for g, v in degree.items()})
print(" alone", alone)
print(" withKids", with_kids)
print(" foreign", foreign)
print(" famous", len(famous))
print(" shelter %s\n food %s" % (sorted(shelter.items()), sorted(food.items())))
print(" wrote %s (%d KB)" % (os.path.normpath(OUT), os.path.getsize(OUT) // 1024))
print(" workers CA", [(y, ca_workers[y]) for y in (1990, 2000, 2010, 2026, 2040, 2050)])
print(" emp rate gaps", {g: [y for y in range(Y0, WORK_TO + 1) if y not in v] for g, v in emp_rate.items() if any(y not in v for y in range(Y0, WORK_TO + 1))})
for c in ("US", "CN", "EU"):
    w = countries[c]["workers"]; print(" workers", c, [(y, w["values"][y - w["start"]]) for y in (1990, 2000, 2010, 2026, 2040, 2050)])
print(" prime", {c: (d["prime"]["values"][0], d["prime"]["values"][2026 - Y0], d["prime"]["values"][-1]) for c, d in countries.items()})
