# Rebuilding the data

`data/data.js` is generated. To refresh it (for example when Statistics
Canada publishes a new year), download the sources into one folder and run:

    python3 tools/build_data.py RAW_DIR

`RAW_DIR` needs one sub-folder per Statistics Canada table, each holding the
unzipped CSV from `https://www150.statcan.gc.ca/n1/tbl/csv/<table>-eng.zip`:

| Folder     | Table         | Used for                                   |
|------------|---------------|--------------------------------------------|
| 17100029   | 17-10-0029-01 | Population by age, 1921 to 1970            |
| 17100005   | 17-10-0005-01 | Population by age, 1971 to latest          |
| 17100057   | 17-10-0057-01 | Projected population (scenario M1)         |
| 17100008   | 17-10-0008-01 | Immigrants, 1971/72 on                     |
| 13100418   | 13-10-0418-01 | Births per woman, 1991 on                  |
| 18100005   | 18-10-0005-01 | Consumer Price Index                       |
| 37100150   | 37-10-0150-01 | Undergraduate tuition, 1972 to 2005        |
| 37100045   | 37-10-0045-01 | Undergraduate tuition, 2006 on             |
| 14100327   | 14-10-0327-01 | Unemployment rate by age group             |
| 11100239   | 11-10-0239-01 | Median income by age group                 |
| 14100118   | 14-10-0118-01 | University degree, ages 25 to 54           |
| 39100056   | 39-10-0056-01 | Mean age at first marriage                 |
| 11100222   | 11-10-0222-01 | Share of spending on shelter and food      |
| 13100417   | 13-10-0417-01 | Mean age of mother at delivery             |
| 13100837   | 13-10-0837-01 | Remaining life expectancy by single age    |
| 37100101   | 37-10-0101-01 | Share in school, single ages 15 to 29      |
| 98100134   | 98-10-0134-01 | Living alone / with children (censuses)    |
| 98100347   | 98-10-0347-01 | Born outside Canada by age (2021 census)   |

and an `ext/` folder with:

- `owid_tfr.csv`: Our World in Data, grapher `children-born-per-woman`, Canada
- `owid_gdp_can.csv`: Our World in Data, grapher `gdp-maddison-project-database`, Canada
- `wb_gdp.json`: World Bank API, indicator `NY.GDP.MKTP.KD.ZG`, country CAN
- `bis.csv`: BIS data portal, series `WS_SPP / Q.CA.R.628` (real house prices)

`famous_CA.csv`, `famous_US.csv`, `famous_CN.csv` and `famous_EU.csv` hold a
widely known person for some birth years (years with no clear candidate are
left out). They are hand-edited lists; change them freely.

The United States, China and the European Union need two more folders:

- `wpp/subset.csv`: columns `iso3,year,age,pop_thousands`, cut from the UN
  World Population Prospects 2024 files
  `WPP2024_PopulationBySingleAgeSex_Medium_1950-2023.csv.gz` and `..._2024-2100.csv.gz`
  for USA, CHN and the 27 EU members, 1990 to 2050.
- `wb/<indicator>.json`: World Bank API responses for USA, CHN and EUU
  (`NY.GDP.MKTP.KD.ZG`, `SP.DYN.TFRT.IN`, `SP.DYN.LE00.IN`, and optionally
  `SL.UEM.1524.ZS`, `SE.TER.ENRR`, `SP.URB.TOTL.IN.ZS`). Missing files are skipped.

Three small series are kept in this folder or in the script itself because
they come from web pages rather than tables: immigration before 1972
(`immigration_1915_2014.csv`), the census share of young adults living with
a parent, and the recession dates.

The site shows 1990 to 2050 (`Y0`, `Y1` at the top of the script). Yearly
indicators are kept from 1921 so that older lives still have a history.

## What is estimated

- Before 2000 the source gives one "90 and over" total. It is split across
  single ages using the 2000 pattern.
- Tuition is converted to the latest CPI year's dollars.

Not included, because no consistent national series was found: age at first
home purchase.

- `ilo/EAP_2WAP_SEX_AGE_RT.csv`, `ilo/UNE_2EAP_SEX_AGE_RT.csv`: ILO SDMX (`https://sdmx.ilo.org/rest/data/ILO,DF_<name>/<countries>.A..SEX_T.?startPeriod=1990&format=csv`), participation and unemployment rates by age for USA, CHN and the 27 EU members; used for workers per non-worker
