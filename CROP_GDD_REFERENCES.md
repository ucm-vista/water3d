# Crop GDD References

This document captures source-backed growing degree day (GDD) assumptions for the crop profiles currently selectable in Water 3D.

The app stores GDD thresholds in Celsius degree-days (CDD). When a source reports Fahrenheit degree-days (FDD), convert with:

```text
CDD = FDD / 1.8
FDD = CDD * 1.8
```

The current frontend GDD calculation uses daily Tmin/Tmax, a lower threshold, and an upper threshold:

```text
daily GDD = max(0, ((min(Tmax, upper) + max(Tmin, base)) / 2) - base)
```

Some cited models use single-sine methods or crop-specific biofix dates. Those values are still useful as defaults, but the app should label them as approximations until the matching model method is implemented.

## Recommended App Defaults

| Crop | Base | Upper | Suggested stage thresholds in CDD | Notes |
| --- | ---: | ---: | --- | --- |
| Almond | 4.5°C, provisional | 30°C, provisional | Keep current broad stages for now; use separate hull-split model later | UC hull-split model is not a simple universal stage-threshold table. It predicts 1% hull split using full bloom date and temperature accumulation during the first 90 days after bloom. |
| Processing tomato | 7.2°C | 33.3°C | First Flower: 277-333; 2-inch Fruit: 572-608; Harvest: 1024-1117 | OSU Croptime tomato model uses 45°F lower and 92°F upper thresholds for transplanted tomato. |
| Wine grape | 10°C | 30°C, app cap | Budbreak: 0; Bloom: local/cultivar-specific; Veraison: cultivar-specific; Harvest/Ripening suitability: 1000-1944 | Grape GDD is commonly used for seasonal heat/ripening suitability, not exact universal stage timing. OSU cites 1800-2500 FDD for cool cultivars and 2500-3500 FDD for warm cultivars. |
| Pistachio | 10°C | 30°C, app cap | Bloom: 0; Shell Hardening: 665 | UC IPM shell-hardening model uses 75% bloom as biofix, lower threshold 50°F, single-sine method, and shell hardening at 665 CDD. |
| Cotton | 15.6°C | 30°C, app cap | Emergence: 28-33; First Square: 264-297; First Flower: 431-472; Open Boll: 903-1000; Harvest Ready: 1222-1444 | Cotton references commonly use DD60, lower threshold 60°F. UC IPM confirms Acala cotton degree-days use lower threshold 60°F. |
| Alfalfa | 5°C | 30°C, app cap | Green-up: 0; First Cut Window: 389-417 | UMN Extension recommends first cut near 700-750 FDD with base 41°F. UC IPM gives a more detailed alfalfa harvest model with season-specific thresholds. |

## Crop Notes And Sources

### Almond

Source-backed finding:

- UC ANR/UC Davis developed an almond hull-split prediction model using an 8-year study across major Central Valley growing regions.
- The model predicts almond hull split from user-provided full bloom date and temperature readings during the first 90 days after bloom.
- UC ANR describes the relationship between days after full bloom to 1% hull split and accumulated GDD during that early post-bloom period.

Implication for Water 3D:

- Do not treat almond hull split as a single universal static GDD threshold.
- Keep broad almond stage defaults for now, but add a separate almond hull-split model later using full bloom date and GDD90.

Sources:

- UC ANR Fruit & Nut Research and Information Center, Almond Hull-Split Model Development: https://ucanr.edu/site/fruit-nut-research-information-center/almond-hull-split-model-development
- UC Davis Fruit & Nut Research and Information Center, About Almond Hull-Split Prediction: https://fruitsandnuts.ucdavis.edu/almond-hull-split-prediction-model-0

### Processing Tomato

Source-backed finding:

- Oregon State University Extension Croptime tomato model uses:
  - Lower threshold: 45°F / 7.2°C
  - Upper threshold: 92°F / 33.3°C
  - Single-sine method with horizontal cutoff
- Reported transplanted tomato model stage values:
  - First flower: 498-600 FDD = 277-333 CDD
  - 2-inch fruit growth: 1029-1094 FDD = 572-608 CDD
  - Harvest: 1844-2010 FDD = 1024-1117 CDD

Implication for Water 3D:

- Update tomato base and upper thresholds.
- Replace current rough tomato stages with first flower, fruit growth, and harvest thresholds from OSU, either as ranges or representative values.

Source:

- OSU Extension, Vegetable degree-day models: https://extension.oregonstate.edu/catalog/em-9305-vegetable-degree-day-models-introduction-farmers-gardeners

### Wine Grape

Source-backed finding:

- OSU Extension states grape growing degree days are calculated with a 50°F threshold, typically April 1 through Oct. 31 in Oregon wine regions.
- OSU gives seasonal ripening suitability ranges:
  - Cool-climate cultivars: 1800-2500 FDD = 1000-1389 CDD
  - Warm-climate cultivars: 2500-3500 FDD = 1389-1944 CDD

Implication for Water 3D:

- Keep base threshold at 10°C.
- Treat grape GDD primarily as ripening suitability unless cultivar-specific phenology thresholds are added.
- Current fixed bloom/veraison thresholds should be marked provisional.

Source:

- OSU Extension, Establishing a vineyard in Oregon: https://extension.oregonstate.edu/catalog/em-8973-establishing-vineyard-oregon-quick-start-resource-guide

### Pistachio

Source-backed finding:

- UC IPM pistachio shell-hardening model uses:
  - Biofix: 75% bloom
  - Lower threshold: 50°F / 10°C
  - Method: single sine
  - Shell hardening: 1197 FDD = 665 CDD

Implication for Water 3D:

- Update pistachio base threshold to 10°C.
- Keep shell hardening at 665 CDD, but calculate from bloom biofix/stage start.
- Treat kernel fill and harvest thresholds as provisional until a source-backed pistachio crop-stage model is added.

Source:

- UC IPM, Pistachio Shell Hardening: https://ipm.ucanr.edu/weather/phenology-models-description/pistachio-shell-hardening/

### Cotton

Source-backed finding:

- UC IPM says Acala cotton in the San Joaquin Valley accumulates degree-days using a lower threshold of 60°F.
- UC IPM also says cotton seed needs approximately 50 degree-days for emergence under good planting depth.
- National Cotton Council states cotton heat units are DD60s, using a 60°F threshold.
- Cotton growth stage heat-unit ranges from National Cotton Council:
  - Planting to emergence: 50-60 FDD = 28-33 CDD
  - Emergence to first square: 425-475 FDD = 236-264 CDD after emergence
  - Square to flower: 300-350 FDD = 167-194 CDD
  - Planting to first flower: 775-850 FDD = 431-472 CDD
  - Flower to open boll: 850-950 FDD = 472-528 CDD
  - Planting to harvest ready: 2200-2600 FDD = 1222-1444 CDD

Implication for Water 3D:

- Cotton base threshold is correct at 15.6°C.
- Current first bloom/open boll values are high/low depending on whether they are cumulative from planting or interval thresholds. Use cumulative-from-planting thresholds in the crop profile:
  - Emergence: 28-33 CDD
  - First square: roughly 264-297 CDD if adding emergence plus emergence-to-square
  - First flower: 431-472 CDD
  - Open boll: roughly 903-1000 CDD if adding planting-to-first-flower plus flower-to-open-boll
  - Harvest ready: 1222-1444 CDD

Sources:

- UC IPM, Cotton Selecting a Planting Date: https://ipm.ucanr.edu/agriculture/cotton/selecting-a-planting-date/
- UC IPM, Cotton Integrated Weed Management: https://ipm.ucanr.edu/agriculture/cotton/integrated-weed-management/
- National Cotton Council, Cotton Growth and Development: https://www.cotton.org/tech/ace/growth-and-development.cfm

### Alfalfa

Source-backed finding:

- UMN Extension says alfalfa uses a base temperature of 41°F / 5°C.
- UMN recommends planning first cut near 700-750 FDD = 389-417 CDD.
- UC IPM also has an alfalfa harvest phenology model with season-specific lower thresholds and one-tenth flower thresholds:
  - Spring lower threshold: 38.3°F / 3.5°C
  - Early summer lower threshold: 45.5°F / 7.5°C
  - Late summer lower threshold: 50°F / 10°C
  - One-tenth flower spring: 1053 FDD = 585 CDD
  - One-tenth flower early/late summer: 765 FDD = 425 CDD

Implication for Water 3D:

- Base 5°C is acceptable for a simple first-cut planning model.
- Current cutting window near 700 CDD is too high if using the UMN first-cut guidance; change the first-cut threshold to about 400 CDD.
- Add season-specific alfalfa model later if we want UC IPM-style one-tenth flower timing.

Sources:

- UMN Extension, Using growing degree days to plan early-season alfalfa harvests: https://extension.umn.edu/forage-harvest-and-storage/using-growing-degree-days-plan-early-season-alfalfa-harvests
- UC IPM, Alfalfa Harvest: https://ipm.ucanr.edu/weather/phenology-models-description/alfalfa-harvest/

## Implementation Recommendations

1. Add source metadata to crop profiles:
   - `gddSourceUrl`
   - `gddSourceLabel`
   - `gddMethod`
   - `gddBiofix`

2. Distinguish static crop-stage thresholds from model-specific workflows:
   - Almond hull split should be its own model.
   - Pistachio shell hardening should use 75% bloom as biofix.
   - Alfalfa should support reset-after-cutting or season-specific thresholds.

3. Update current crop defaults:
   - Tomato: base 7.2°C, upper 33.3°C, OSU thresholds.
   - Pistachio: base 10°C, shell hardening 665 CDD.
   - Cotton: cumulative DD60-derived thresholds.
   - Alfalfa: first-cut window near 400 CDD.

4. Keep user-adjustable thresholds:
   - These source-backed defaults should seed the UI.
   - Users should still be able to override thresholds per field.

5. Label confidence in the UI:
   - `Source-backed`: tomato, pistachio shell hardening, cotton DD60 stages, alfalfa first-cut.
   - `Provisional`: almond static broad stages, grape exact bloom/veraison stages, pistachio kernel fill/harvest.
