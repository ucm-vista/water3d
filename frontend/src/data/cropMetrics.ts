import type { CropId, StageThreshold } from "../types/domain";

export type CropMetricConfidence = "mock" | "provisional" | "source-backed";

export interface CropMetricSource {
  label: string;
  url: string;
  note?: string;
}

export interface GddMetricConfig {
  baseTempC: number;
  upperTempC: number;
  method: "simple-average" | "single-sine";
  biofixLabel: string;
  stages: StageThreshold[];
  confidence: CropMetricConfidence;
  sources: CropMetricSource[];
}

export interface ChillMetricConfig {
  enabled: boolean;
  unitLabel: "Chill Portions";
  thresholdMinC?: number;
  thresholdMaxC?: number;
  requirement?: number;
  defaultStartRule: "none" | "previous-july-15" | "previous-nov-01";
  confidence: CropMetricConfidence;
  sources: CropMetricSource[];
}

export interface CropMetricProfile {
  cropId: CropId;
  displayName: string;
  perennial: boolean;
  gdd: GddMetricConfig;
  chill: ChillMetricConfig;
  comparisonYears: number[];
  notes: string[];
}

const paredes2025Source: CropMetricSource = {
  label: "Paredes et al. 2025 GDD threshold review",
  url: "https://doi.org/10.1016/j.agwat.2025.109755",
  note: "Review paper used as the source of Tbase/Tupper values where the crop is covered.",
};

export const cropMetricProfiles: Record<CropId, CropMetricProfile> = {
  almond: {
    cropId: "almond",
    displayName: "Almond",
    perennial: true,
    gdd: {
      baseTempC: 4.5,
      upperTempC: 35,
      method: "simple-average",
      biofixLabel: "Full bloom / user stage-start date",
      confidence: "provisional",
      stages: [
        {
          label: "Dormancy",
          gdd: null,
          note: "Winter chill accumulation period",
        },
        {
          label: "Bud Swell",
          gdd: null,
          note: "Dormancy break and bud development",
        },
        {
          label: "Bloom",
          gdd: 0,
          note: "Biofix date (full bloom)",
        },
        {
          label: "Petal Fall",
          gdd: 100,
          confidence: "placeholder",
        },
        {
          label: "Fruit Set",
          gdd: 250,
          confidence: "placeholder",
        },
        {
          label: "Nut Development",
          gdd: 800,
          confidence: "placeholder",
        },
        {
          label: "Kernel Fill",
          gdd: 1400,
          confidence: "placeholder",
        },
        {
          label: "Hull Split",
          gdd: 1900,
          confidence: "placeholder",
        },
        {
          label: "Harvest",
          gdd: 2600,
          confidence: "placeholder",
        },
        {
          label: "Post-Harvest",
          gdd: null,
          note: "Leaf retention and carbohydrate storage",
        },
      ],
      sources: [
        {
          ...paredes2025Source,
          note: "Table 11 reports almond Tbase 4.5C and Tupper 35C for full-cycle field trials; stage thresholds remain mock.",
        },
        {
          label: "UC ANR Almond Hull-Split Model",
          url: "https://ucanr.edu/site/fruit-nut-research-information-center/almond-hull-split-model-development",
          note: "Mock static stages until the bloom-date/GDD90 hull-split model is implemented.",
        },
      ],
    },
    chill: {
      enabled: true,
      unitLabel: "Chill Portions",
      requirement: 65,
      defaultStartRule: "previous-nov-01",
      confidence: "mock",
      sources: [
        {
          label: "UC ANR almond chill model notes",
          url: "https://fruitsandnuts.ucdavis.edu/almond-hull-split-prediction-model-0",
          note: "Chill Portion requirement is a provisional placeholder; accumulation uses the Dynamic Model (Fishman–Erez).",
        },
      ],
    },
    comparisonYears: [2023, 2024, 2025],
    notes: ["Priority crop. Tbase/Tupper now come from Paredes et al. 2025; replace mock static stages with UC hull-split model once model constants are finalized."],
  },
  tomato: {
    cropId: "tomato",
    displayName: "Processing Tomato",
    perennial: false,
    gdd: {
      baseTempC: 8,
      upperTempC: 33,
      method: "simple-average",
      biofixLabel: "Transplant / planting date",
      confidence: "source-backed",
      stages: [
        { label: "First Flower", gdd: 305 },
        { label: "2-inch Fruit", gdd: 590 },
        { label: "Harvest", gdd: 1070 },
      ],
      sources: [
        {
          ...paredes2025Source,
          note: "Table 3 reports tomato full-cycle values around Tbase 7-10C and Tupper 28-33C; 8/33C selected from the field-observation full-cycle row.",
        },
        {
          label: "OSU Extension Croptime tomato model",
          url: "https://extension.oregonstate.edu/catalog/em-9305-vegetable-degree-day-models-introduction-farmers-gardeners",
        },
      ],
    },
    chill: { enabled: false, unitLabel: "Chill Portions", defaultStartRule: "none", confidence: "mock", sources: [] },
    comparisonYears: [2023, 2024, 2025],
    notes: ["CDD stage thresholds are midpoint values from OSU source ranges; Tbase/Tupper now use Paredes et al. 2025 table values."],
  },
  wineGrape: {
    cropId: "wineGrape",
    displayName: "Wine Grape",
    perennial: true,
    gdd: {
      baseTempC: 10,
      upperTempC: 35,
      method: "simple-average",
      biofixLabel: "Budbreak / user stage-start date",
      confidence: "provisional",
      stages: [
        { label: "Budbreak", gdd: 0 },
        { label: "Bloom", gdd: 350 },
        { label: "Veraison", gdd: 1400 },
        { label: "Harvest", gdd: 2200 },
      ],
      sources: [
        {
          ...paredes2025Source,
          note: "Table 10 reports wine grape values including Tbase 10C and Tupper 35C for budburst-to-harvest field trials.",
        },
        {
          label: "OSU Extension vineyard GDD guidance",
          url: "https://extension.oregonstate.edu/catalog/em-8973-establishing-vineyard-oregon-quick-start-resource-guide",
          note: "Source supports base temperature and ripening suitability ranges; exact stage thresholds are provisional.",
        },
      ],
    },
    chill: {
      enabled: true,
      unitLabel: "Chill Portions",
      requirement: 50,
      defaultStartRule: "previous-nov-01",
      confidence: "mock",
      sources: [],
    },
    comparisonYears: [2023, 2024, 2025],
    notes: ["Tbase/Tupper now come from Paredes et al. 2025; use as a heat accumulation/ripening view until cultivar-specific phenology thresholds are sourced."],
  },
  pistachio: {
    cropId: "pistachio",
    displayName: "Pistachio",
    perennial: true,
    gdd: {
      baseTempC: 7.2,
      upperTempC: 29.4,
      method: "simple-average",
      biofixLabel: "75% bloom / user stage-start date",
      confidence: "provisional",
      stages: [
        { label: "Bloom", gdd: 0 },
        { label: "Shell Hardening", gdd: 665 },
        { label: "Kernel Fill", gdd: 1200 },
        { label: "Harvest", gdd: 1800 },
      ],
      sources: [
        {
          ...paredes2025Source,
          note: "Table 11 reports Kerman pistachio Tbase 7.2C and Tupper 29.4C from historical yield-temperature data; another selected row reports 9/35C.",
        },
        {
          label: "UC IPM Pistachio Shell Hardening",
          url: "https://ipm.ucanr.edu/weather/phenology-models-description/pistachio-shell-hardening/",
          note: "Shell hardening is source-backed; later stages are provisional.",
        },
      ],
    },
    chill: {
      enabled: true,
      unitLabel: "Chill Portions",
      requirement: 58,
      defaultStartRule: "previous-nov-01",
      confidence: "mock",
      sources: [],
    },
    comparisonYears: [2023, 2024, 2025],
    notes: ["Tbase/Tupper now use the Kerman row from Paredes et al. 2025. Shell hardening should eventually use the UC single-sine method exactly."],
  },
  cotton: {
    cropId: "cotton",
    displayName: "Cotton",
    perennial: false,
    gdd: {
      baseTempC: 12,
      upperTempC: 35,
      method: "simple-average",
      biofixLabel: "Planting date",
      confidence: "provisional",
      stages: [
        { label: "Emergence", gdd: 30 },
        { label: "First Square", gdd: 280 },
        { label: "First Flower", gdd: 450 },
        { label: "Open Boll", gdd: 950 },
        { label: "Harvest Ready", gdd: 1330 },
      ],
      sources: [
        {
          ...paredes2025Source,
          note: "Table 6 reports cotton Tbase around 12-12.8C and Tupper 30-35C; 12/35C selected from field-trial full-cycle rows.",
        },
        {
          label: "UC IPM Cotton Planting Date",
          url: "https://ipm.ucanr.edu/agriculture/cotton/selecting-a-planting-date/",
        },
        {
          label: "National Cotton Council Growth and Development",
          url: "https://www.cotton.org/tech/ace/growth-and-development.cfm",
        },
      ],
    },
    chill: { enabled: false, unitLabel: "Chill Portions", defaultStartRule: "none", confidence: "mock", sources: [] },
    comparisonYears: [2023, 2024, 2025],
    notes: ["Priority crop. Tbase/Tupper now come from Paredes et al. 2025. Existing stage thresholds are provisional because they were originally derived from DD60 guidance and need recalibration for Tbase 12C."],
  },
  alfalfa: {
    cropId: "alfalfa",
    displayName: "Alfalfa",
    perennial: false,
    gdd: {
      baseTempC: 5,
      upperTempC: 35,
      method: "simple-average",
      biofixLabel: "Green-up / cutting reset date",
      confidence: "source-backed",
      stages: [
        { label: "Green-up", gdd: 0 },
        { label: "First Cut Window", gdd: 400 },
      ],
      sources: [
        {
          ...paredes2025Source,
          note: "Table 9 reports alfalfa full-cycle Tbase 5C and Tupper 35C.",
        },
        {
          label: "UMN Extension Alfalfa GDD",
          url: "https://extension.umn.edu/forage-harvest-and-storage/using-growing-degree-days-plan-early-season-alfalfa-harvests",
        },
      ],
    },
    chill: { enabled: false, unitLabel: "Chill Portions", defaultStartRule: "none", confidence: "mock", sources: [] },
    comparisonYears: [2023, 2024, 2025],
    notes: ["Tbase/Tupper now come from Paredes et al. 2025. Later implementation should support reset after each cutting."],
  },
  other: {
    cropId: "other",
    displayName: "Custom Crop",
    perennial: false,
    gdd: {
      baseTempC: 10,
      upperTempC: 30,
      method: "simple-average",
      biofixLabel: "Season start date",
      confidence: "mock",
      stages: [],
      sources: [],
    },
    chill: { enabled: false, unitLabel: "Chill Portions", defaultStartRule: "none", confidence: "mock", sources: [] },
    comparisonYears: [2023, 2024, 2025],
    notes: ["User-defined crop. Base/upper temperatures and growth stages are entered manually; no source-backed defaults apply."],
  },
};

export function getCropMetricProfile(cropId: CropId): CropMetricProfile {
  return cropMetricProfiles[cropId];
}
