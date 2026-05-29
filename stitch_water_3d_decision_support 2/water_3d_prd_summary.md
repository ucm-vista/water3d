# Water 3D Product Requirements Document (PRD)

## 1. Summary
Water 3D is a decision support tool for Central Valley California growers and irrigation managers. It integrates agronomic calculations—GDD, ETc, soil water balance, chill accumulation, frost/heat stress, and VPD—into a crop-aware model. "3D" refers to thermal time, water demand, and soil water status.

## 2. Key Decisions Supported
- **Phenology timing**: Current stage (bloom, veraison, etc.) and time to next.
- **Irrigation scheduling**: Days to MAD; recommended depth.
- **Seasonal water budget**: Projected total applied water vs. budget.
- **Dormancy/Chill**: Chill portion accumulation vs. requirement.
- **Stress events**: Frost, heat, and high-VPD risk management.

## 3. Crop Parameters (v1)
Covers Almond, Processing Tomato, Wine Grape, and Alfalfa with specific Tbase, Tupper, Kc curves, MAD, and stress thresholds.

## 4. Calculation Modules
- **GDD**: Daily and cumulative degree-day averaging.
- **ETc**: Piecewise-linear Kc interpolation driven by GDD or days.
- **Soil Water Balance**: Daily depletion (Dr), TAW/RAW, and forecast projection.
- **Dynamic Chill Model**: Hourly-based chill portions.
- **Stress Counters**: Frost/heat hour tracking against stage-specific critical temps.
- **Vapor Pressure Deficit (VPD)**: Derived from Tmean and RH/Tdew.

## 5. Technical Requirements
- **API**: Historical/Forecast weather (Tmin, Tmax, Precip, ETo) + optional RH/Hourly.
- **Stack**: TypeScript calculation core, framework-agnostic.
- **Success Metrics**: 5% margin of error vs. UC ANR/IPM standards.