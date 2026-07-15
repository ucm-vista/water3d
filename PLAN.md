# GDD Calculator — Action Plan (post-review meeting)

**Source:** Emery + Ibrahim review of the growing degree day (GDD) calculator.
**Hard deadline:** v1 to Josh **by Wednesday**.
**Guiding priority (Emery):** data *accuracy* and *clear* visualization come before styling
(logos, favicons). Make current-vs-projected values unambiguous.

Owners: **I** = Ibrahim, **E** = Emery, **Ext** = John Abatzoglou / Catherine.

---

## Implementation status (2026-07-15)

**Shipped (code, builds + 44 tests pass):**
- **W4 loader** — new `ChartLoader.tsx`: determinate progress bar for the first ~11s,
  then flips to an indeterminate bar + "Still loading — fetching multi-year weather…".
  Wired into `Dashboard` (replaces the old always-indeterminate overlay). CSS in `app.css`.
- **W3 bar chart** — GDD view now has a **Cumulative | Daily** toggle
  (`InlineMetricControls`); daily mode renders daily-GDD bars (historical vs forecast
  colored) with the 5-yr-average daily line. New `gddDailyChartData` in `Dashboard`.
- **W2 forecast projection** — **decision: hard-cap at 28 days.** The dashed
  current-season projection now stops at the forecast horizon instead of Dec 31
  (`projectedByDate` capped at `forecastHorizonDate`); the 5-yr-average and prior-year
  reference curves still span the full year as context. Legend copy updated.
  *Note:* the Growth Stage Timeline table still projects stage dates via the 5-yr
  average (that's the "when will my crop reach X stage" feature) — left intact.
- **W5 storage/accounts** — **decision: hide save, keep auth code.** New
  `BROWSER_STORAGE_ONLY` flag in `fieldStorage.ts` forces localStorage for everyone;
  no field reads/writes hit PocketBase. Auth (login/signup) code untouched and easy to
  re-enable (flip the flag). Account-menu copy fixed so it no longer claims "PocketBase
  storage."
- **W1 data-source link** — footer now links **gridMET** and **Climate Toolbox**
  (`App.tsx` + `.footer-sources` CSS). *(Meeting/verification still pending — see W1.)*
- **W6 mobile/UI** — **hamburger menu** on phones (≤720px) in `Header.tsx` + CSS;
  fixed the **field-edit-button** white-block mismatch on hovered/active rows.

**Not code — still owned by Ibrahim:**
- **W1 meeting** — book/lead the Abatzoglou/Catherine gridMET session; reply to the API email.
- **W7 styling** — deferred by design (logo/favicon, live-server polish).

---

## Workstream 1 — Data source & API verification  🔴 credibility blocker

The reviewer questioned **where the ETO data comes from**. Four ETo providers exist
in the code, but only two are actually wired into the live season path:

**Active (season query, `src/api/queries/weather.ts:61-68`):**
- **gridMET** `pet` → `etoMm` — historical/primary (`src/api/gridMet.ts:79`;
  `pet` = `daily_mean_reference_evapotranspiration_grass`, `config/gridmet.ts:11`).
  Served via U. Idaho Climate Toolbox netCDF service (`config/gridmet.ts:22`).
- **Climate Toolbox CFS** `pet` → `etoMm` — the 28-day forecast leg
  (`src/api/climate.ts:95-125`, endpoint `config/climate.ts:3,8`).

**Present but NOT called in the primary path** (swappable alternatives):
- OpenET `ETo` (`src/api/openEt.ts:282`, gated on token) — used for actual ETc, not the ETo line.
- Open-Meteo `et0_fao_evapotranspiration` (`src/api/openMeteo.ts:88`) — alternate historical source.

So the honest answer today: **displayed ETo = gridMET (history) + Climate Toolbox CFS
(forecast)**. That is the story to verify with Abatzoglou/Catherine.

**Actions**
- [ ] **(I, lead)** Prepare an API brief: for each provider, which variable, what
      units, what date range, and which one is authoritative for ETO vs a fallback.
      Reply to the outstanding email with these implementation details for reference.
- [ ] **(I → Ext)** Book & **lead** a meeting with Abatzoglou + Catherine to verify
      data sources and API usage. **Scope = gridMET** (not Climate Toolbox). E to help
      coordinate availability, but I owns the meeting.
- [ ] **(I)** After verification, pick the canonical ETO source and document the
      fallback order in code comments + README.
- [ ] **(I)** Add a visible **"Data source" link** in the UI pointing at the provider
      (attribution is currently missing from the dashboard).

**Definition of done:** we can state, in one sentence, where every displayed number
comes from, and the UI links to it.

---

## Workstream 2 — Forecasting logic 🔴

Projected data currently runs to the **end of the year** even though the forecast
window is **28 days**. Root cause is pinned down:

- The dashed **`projected` GDD series** (`projectedByDate` memo, `Dashboard.tsx:512-527`)
  walks forward day-by-day but its loop terminates at **`yearEndDate` = `${currentYear}-12-31`**
  (defined `Dashboard.tsx:213`): guard `:515`, `end` `:519`, `while (cursor < end)` `:520`.
  It fills to Dec 31 using the 5-year-average daily curve.
- The **current/forecast** line is already correctly clamped to `actualEndDate`
  (`Dashboard.tsx:501-503`) — only the projection overshoots.
- Forecast horizon is genuinely 28 (`FORECAST_RANGE_OPTIONS=[0,7,14,28]`,
  `weather.ts:103`; `MAX_FORECAST_DAYS`, `Dashboard.tsx:43`; CTB slice `climate.ts:124,203`).

**Actions**
- [ ] **(I)** Decide the intended behavior: (a) cap the dashed projection at
      `forecastHorizonDate`/`MAX_FORECAST_DAYS` by changing the loop bound at
      `Dashboard.tsx:515,519-520` from `yearEndDate`; or (b) keep the full-season
      stage projection but **clearly label** it "long-range projection," not forecast.
- [ ] **(I)** Enumerate the other "several logic problems" flagged in the meeting during
      this audit and list them here.
- [ ] **(I)** Verify `+7 / +14 / +28` selectors actually change the data
      (clamp logic at `Dashboard.tsx:266`).
- [ ] **(I)** Distinguish three tiers visually: **observed** → **28-day forecast** →
      **long-range projection**.

---

## Workstream 3 — Charts & visualization 🟠

Cumulative view is a `recharts` `ComposedChart` (GDD/chill at `Dashboard.tsx:1036-1122`,
ET at `:966-1034`). Good news for the ask: `Bar` is **already imported** (`Dashboard.tsx:2`)
and the ET chart already draws **daily ET bars** — so daily GDD bars are low-effort to add.

**Actions**
- [ ] **(I)** Add a **daily-GDD bar-chart option** alongside the cumulative view,
      reusing the existing `Bar` usage. Add a toggle; keep cumulative as default.
- [ ] **(I)** Sharpen **current vs projected** distinction. Partly done already —
      `current` is a solid `Line` (`Dashboard.tsx:1108`), `projected` is dashed
      `strokeDasharray="5 5"` (`:1105`) — but the projection overshoot (W2) undermines it.
      Consider a shaded projection band + explicit legend labels.
- [ ] **Do NOT** add scroll-to-zoom — Emery: too easy to confuse users. (No action;
      recorded so we don't re-add it.)

---

## Workstream 4 — Loading UX & data-load reliability 🟠

Two related meeting points: the loader reads as "broken" on long fetches, **and** there
were "data loading problems" (data sometimes doesn't come back cleanly).

Today the loader is a pure-CSS **indeterminate** loop (`src/components/TomatoLoader.tsx`,
styles under `.gdd-loader` in `src/styles/app.css`). On the data side there is already a
20s fetch timeout (`src/utils/fetchWithTimeout.ts:1`), partial-success **warnings**
(`src/api/queries/weather.ts:58-94`), and a warning banner in the UI
(`Dashboard.tsx:346-349`, rendered `:918`) — but slow/failed providers still surface poorly.

**Actions — loader**
- [ ] **(I)** Make the loader **deterministic first**, then fall back to indeterminate
      after **10–12s** (per Emery). At minimum add a live indicator — animation or a
      **"still loading…"** label — so users see it's active.
- [ ] **(I)** Trigger the fallback state on the weather/computation queries
      (TanStack Query is already in place — hook into `isLoading`/`isFetching`).

**Actions — reliability**
- [ ] **(I)** Reproduce and characterize the "data loading problems": which provider,
      timeout vs error vs empty (gridMET lag warning at `weather.ts:74` is a known one).
- [ ] **(I)** Make partial-failure/warning states legible (clear message + retry),
      not a stuck loader. Confirm the 20s timeout is right for the slowest provider.

---

## Workstream 5 — Storage & accounts 🟠

Save/account flow has issues. Emery's call: **don't require account creation** for v1.

Current state: `src/backend/fieldStorage.ts` already supports `localStorage`
(`water3d.fields.v1`) **and** PocketBase, chosen by auth state. Auth + signup UI exist
(`src/backend/authRepository.ts`, `src/components/AuthStatus.tsx`).

**Actions**
- [ ] **(I)** For v1, **default to browser storage** (localStorage); temporarily
      **remove/hide the explicit "save" (PocketBase) path** so there's no broken save.
- [ ] **(I)** Prompt account creation **only when data migration is needed** (i.e., user
      wants their browser-stored fields to persist across devices) — better UX and a
      natural reason to sign up.
- [ ] **(I)** **Clean up account info** UI (per Josh's questions / stale account state).

> Note: memory says PocketBase auth was recently *activated*. This workstream partially
> reverses that for v1 — confirm with Emery before ripping it out; hiding (not deleting)
> the save path is the safer move.

---

## Workstream 6 — Mobile & UI consistency 🟡

- [ ] **(I)** Add a **hamburger menu** for mobile. Current nav is always-expanded
      (`src/components/Header.tsx:28`, `.main-nav` in `app.css`) — no responsive collapse.
- [ ] **(I)** Fix **inconsistent field backgrounds** in the field list
      (`.field-row` / `.field-row-active`, `src/styles/app.css:1134–1158`).
- [ ] **(I)** General mobile pass on the dashboard layout.

---

## Workstream 7 — Styling polish 🟢 (deprioritized)

Per Emery, **after** data + forecasts are correct:
- [ ] Logo / favicon.
- [ ] Layout & styling refinements on the live server.

---

## Sequenced path to the Wednesday v1 (for Josh)

**Must-ship (correctness & clarity):**
1. W2 — forecast/projection audit + capping/labeling.
2. W1 — start the Abatzoglou/Catherine meeting thread + reply to the API email
   (verification can land after v1, but the API brief should exist now).
3. W3 — current-vs-projected visual distinction; add bar-chart toggle.
4. W4 — loader "still loading" fallback after 10–12s.
5. W5 — switch to browser storage, hide the broken save path.

**Should-ship if time allows:** W1 data-source link, W6 hamburger + field-background fix.

**Explicitly deferred:** W7 (logo/favicon), full account system, scroll-zoom (rejected).

---

## Open questions to resolve
- Which single provider is authoritative for **ETO**? (→ W1 meeting)
- Is full-season projection **intended**, or should it hard-cap? (→ W2 audit)
- OK to hide PocketBase save for v1 given it was just activated? (→ confirm with E)
- What exactly were Josh's outstanding questions? (→ clarify, feeds W5 account cleanup)

---

## Explicitly out of scope (raised but not project work)
- **Codex → Claude switch / OpenAI billing & refund issues** — personal tooling, not a
  product task. Recorded here so it's clear it was considered and set aside, not missed.

---

## Coverage check (every meeting point → where it lives)
| Meeting point | Workstream |
|---|---|
| Source of ETO data questioned | W1 |
| Bar chart in addition to cumulative | W3 |
| Consult Abatzoglou + Catherine on data/APIs; check availability | W1 |
| Ibrahim leads API meeting (scope = gridMET); reply to API email | W1 |
| Add link to data source | W1 |
| Projection runs to end of year vs 28-day window | W2 |
| "Several logic problems" to clean up | W2 |
| Distinguish current vs projected values | W2 + W3 |
| No scroll-zoom | W3 |
| Deterministic→indeterminate loader after 10–12s; "still loading" | W4 |
| Data loading problems | W4 (reliability) |
| Browser storage instead of accounts; remove save temporarily | W5 |
| Prompt account creation on data migration | W5 |
| Clean up account info; Josh's questions | W5 |
| Hamburger menu for mobile | W6 |
| Inconsistent field backgrounds | W6 |
| Mobile interface concerns | W6 |
| Data accuracy/viz before styling (logos, favicons) | Priority + W7 |
| Update layout/styling on live server | W7 |
| Wednesday v1 deadline for Josh | Header + sequence |
| Codex/Claude switch, OpenAI billing | Out of scope |
