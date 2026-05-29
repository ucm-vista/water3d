import type { CropId, CropProfile } from "../types/domain";

export const cropProfiles: Record<CropId, CropProfile> = {
  almond: {
    id: "almond",
    label: "Almond",
    varietyHint: "Nonpareil",
    tBaseC: 4.5,
    tUpperC: 30,
    kcCurve: [
      { position: 0, kc: 0.4 },
      { position: 0.35, kc: 1.15 },
      { position: 0.75, kc: 1.15 },
      { position: 1, kc: 0.9 },
    ],
    stages: [
      { label: "Bloom", gdd: 250 },
      { label: "Nut Fill", gdd: 950 },
      { label: "Hull Split", gdd: 2000 },
      { label: "Harvest", gdd: 2700 },
    ],
    madFraction: 0.4,
    rootDepthM: 1.5,
    tawMmPerM: 150,
    chillRequirementPortions: 65,
    stress: { frostCriticalC: -2, heatCriticalC: 38, highVpdKpa: 2.5 },
  },
  tomato: {
    id: "tomato",
    label: "Processing Tomato",
    tBaseC: 10,
    tUpperC: 30,
    kcCurve: [
      { position: 0, kc: 0.3 },
      { position: 0.45, kc: 1.15 },
      { position: 0.8, kc: 1.15 },
      { position: 1, kc: 0.7 },
    ],
    stages: [
      { label: "Flowering", gdd: 450 },
      { label: "Fruit Set", gdd: 700 },
      { label: "Red Ripe", gdd: 1400 },
    ],
    madFraction: 0.4,
    rootDepthM: 1,
    tawMmPerM: 150,
    stress: { frostCriticalC: 0, heatCriticalC: 35, highVpdKpa: 2.5 },
  },
  wineGrape: {
    id: "wineGrape",
    label: "Wine Grape",
    tBaseC: 10,
    tUpperC: 30,
    kcCurve: [
      { position: 0, kc: 0.3 },
      { position: 0.45, kc: 0.7 },
      { position: 0.8, kc: 0.7 },
      { position: 1, kc: 0.45 },
    ],
    stages: [
      { label: "Budbreak", gdd: 0 },
      { label: "Bloom", gdd: 350 },
      { label: "Veraison", gdd: 1400 },
      { label: "Harvest", gdd: 2200 },
    ],
    madFraction: 0.5,
    rootDepthM: 1.5,
    tawMmPerM: 130,
    chillRequirementPortions: 50,
    stress: { frostCriticalC: -1, heatCriticalC: 35, highVpdKpa: 2.5 },
  },
  alfalfa: {
    id: "alfalfa",
    label: "Alfalfa",
    tBaseC: 5,
    tUpperC: 30,
    kcCurve: [
      { position: 0, kc: 0.4 },
      { position: 0.5, kc: 0.95 },
      { position: 1, kc: 0.9 },
    ],
    stages: [
      { label: "Green-up", gdd: 0 },
      { label: "Canopy", gdd: 350 },
      { label: "Cutting Window", gdd: 700 },
    ],
    madFraction: 0.5,
    rootDepthM: 2,
    tawMmPerM: 140,
    stress: { highVpdKpa: 2.5 },
  },
};

export const cropOptions = Object.values(cropProfiles);
