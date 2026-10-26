---
name: analyse-data
description: The person asks to analyse, chart or summarise data on the board (an imported CSV dataset, a sheet object, a pasted table, numbers in notes) or data they describe.
---
# Analyse data

## Look first
- Read the board summary. A `dataset` window is an imported file kept whole; its summary lists rows and column kinds. Sheets, tables and numbers in notes are smaller data.
- For a dataset, call `data_query` with `profile: true` first. Name the columns, their kinds, gaps and ranges before charting anything. Ignore columns that are empty or identifiers.
- Decide the three or four questions the data can actually answer (what is biggest, how it changed over time, how parts compare, what stands out). Ask nothing the data cannot answer.

## Get exact figures
- Every number you report or chart from a dataset comes from `data_query` over all rows. Never estimate from the preview rows.
- Send the independent queries in ONE turn so they run in parallel: totals by category, a time series with `bucket: "month"`, a status or outcome split, and one outlier check (largest items, `sort` by the measure, `limit` 10).
- Note how many rows matched and how many were blank. Say so when blanks or a filter change the picture.

## Result
- Build everything in ONE `board_apply` batch beside the dataset, with refs, a grid `layout` and `focus`:
  - a **stats** object with three or four headline figures (total, count, average, the biggest share),
  - one **plot** per question. Choose the style for the question: bar or bar_horizontal for comparing categories, line or area for change over time, bar_stacked or area_stacked for parts of a whole, donut only for a few shares of one total,
  - a **sheet** of the main summary table, with best marked where one value wins, so the person can sort it,
  - a **doc** with the write-up: what the data is, the findings as short sections with the key numbers in bold, and caveats (blanks, time coverage, what the data cannot show).
- Write each plot's basis as where the values came from ("All 500 rows of expenses.csv, grouped by department"). Real data is not knowledge: leave knowledge false.
- Lay out as a 12-column grid like a report: the doc spans 6 columns on the left; stats, plots and the sheet fill the right.
- In chat, give the two or three findings that matter most in plain sentences.
- On a follow-up (filter, split, another column), query again and revise the existing objects instead of adding new ones.
