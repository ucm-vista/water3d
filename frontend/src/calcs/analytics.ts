import { cumulativeChillPortions } from "./dynamicModel";
import { dailyGdd } from "./gdd";
import { interpolateKc, seasonProgressFromGdd } from "./kc";
import { dailyMeanVpd } from "./vpd";
import type { AnalyticsSnapshot, CropProfile, DailyAnalytics, FieldConfig, WeatherRecord } from "../types/domain";

export function buildAnalyticsSnapshot(
  field: FieldConfig,
  crop: CropProfile,
  weather: WeatherRecord[],
  appliedWaterMm: number[],
): AnalyticsSnapshot {
  let cumulativeGddValue = 0;
  let cumulativeEtcMm = 0;
  let cumulativeEtoMmValue = 0;
  const startDate = field.stageStartDate;
  const weatherWindow = startDate ? weather.filter((record) => record.date >= startDate) : weather;
  const effectiveCrop = {
    ...crop,
    tBaseC: field.gddBaseTempC ?? crop.tBaseC,
    tUpperC: field.gddUpperTempC ?? crop.tUpperC,
    ...(field.stageThresholds?.length ? { stages: field.stageThresholds } : {}),
  };

  const records: DailyAnalytics[] = weatherWindow.map((record) => {
    const gdd = dailyGdd(record, effectiveCrop);
    cumulativeGddValue += gdd;
    const kc = interpolateKc(effectiveCrop, seasonProgressFromGdd(effectiveCrop, cumulativeGddValue));
    const etcMm = Number((record.etActualMm ?? record.etoMm * kc).toFixed(1));
    cumulativeEtcMm += etcMm;
    cumulativeEtoMmValue += record.etoMm;

    return {
      date: record.date,
      gdd: Number(gdd.toFixed(1)),
      cumulativeGdd: Number(cumulativeGddValue.toFixed(1)),
      kc,
      etcMm,
      cumulativeEtcMm: Number(cumulativeEtcMm.toFixed(1)),
      cumulativeEtoMm: Number(cumulativeEtoMmValue.toFixed(1)),
      vpdKpa: dailyMeanVpd(record),
    };
  });

  const currentGdd = records.at(-1)?.cumulativeGdd ?? 0;
  const numericStages = effectiveCrop.stages.filter((stage) => typeof stage.gdd === "number");
  const currentStage = numericStages.reduce((active, stage) => (typeof stage.gdd === "number" && currentGdd >= stage.gdd ? stage : active), numericStages[0] ?? effectiveCrop.stages[0]);
  const nextStage = numericStages.find((stage) => typeof stage.gdd === "number" && stage.gdd > currentGdd);
  const currentKc = records.at(-1)?.kc ?? effectiveCrop.kcCurve[0].kc;
  const cumulativeEtoMm = Number(weatherWindow.reduce((total, record) => total + record.etoMm, 0).toFixed(1));
  const latestVpd = [...records].reverse().find((record) => typeof record.vpdKpa === "number")?.vpdKpa;
  const chillPortions = effectiveCrop.chillRequirementPortions ? (cumulativeChillPortions(weather).at(-1)?.cumulativePortions ?? 0) : undefined;
  const stressLevel =
    latestVpd && latestVpd >= effectiveCrop.stress.highVpdKpa + 0.5 ? "high" : latestVpd && latestVpd >= effectiveCrop.stress.highVpdKpa ? "moderate" : "low";

  const insights = [
    nextStage
      ? `${nextStage.label} is ${Math.max(0, Math.round((nextStage.gdd ?? 0) - currentGdd))} GDD away at current accumulation.`
      : "The field has reached the final configured stage for this crop profile.",
    `OpenET-style ETc is ${Math.abs(cumulativeEtcMm - cumulativeEtoMm).toFixed(1)} mm ${cumulativeEtcMm >= cumulativeEtoMm ? "above" : "below"} reference ETo for the selected period.`,
    latestVpd && latestVpd >= crop.stress.highVpdKpa
      ? `VPD is elevated at ${latestVpd} kPa; water demand should be watched closely.`
      : "Current atmospheric demand is within the normal operating range.",
  ];

  return {
    field,
    crop: effectiveCrop,
    records,
    currentGdd,
    currentStage,
    nextStage,
    currentKc,
    cumulativeEtcMm: Number(cumulativeEtcMm.toFixed(1)),
    cumulativeEtoMm,
    chillPortions,
    chillRequirement: effectiveCrop.chillRequirementPortions,
    stressLevel,
    vpdKpa: latestVpd,
    insights,
  };
}
