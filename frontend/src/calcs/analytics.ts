import { estimateChillPortions } from "./chill";
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

  const records: DailyAnalytics[] = weather.map((record, index) => {
    const gdd = dailyGdd(record, crop);
    cumulativeGddValue += gdd;
    const kc = interpolateKc(crop, seasonProgressFromGdd(crop, cumulativeGddValue));
    const etcMm = Number((record.etActualMm ?? record.etoMm * kc).toFixed(1));
    cumulativeEtcMm += etcMm;

    return {
      date: record.date,
      gdd: Number(gdd.toFixed(1)),
      cumulativeGdd: Number(cumulativeGddValue.toFixed(1)),
      kc,
      etcMm,
      cumulativeEtcMm: Number(cumulativeEtcMm.toFixed(1)),
      vpdKpa: dailyMeanVpd(record),
    };
  });

  const currentGdd = records.at(-1)?.cumulativeGdd ?? 0;
  const currentStage = crop.stages.reduce((active, stage) => (currentGdd >= stage.gdd ? stage : active), crop.stages[0]);
  const nextStage = crop.stages.find((stage) => stage.gdd > currentGdd);
  const currentKc = records.at(-1)?.kc ?? crop.kcCurve[0].kc;
  const cumulativeEtoMm = Number(weather.reduce((total, record) => total + record.etoMm, 0).toFixed(1));
  const latestVpd = [...records].reverse().find((record) => typeof record.vpdKpa === "number")?.vpdKpa;
  const chillPortions = crop.chillRequirementPortions ? estimateChillPortions(weather) : undefined;
  const stressLevel = latestVpd && latestVpd >= crop.stress.highVpdKpa + 0.5 ? "high" : latestVpd && latestVpd >= crop.stress.highVpdKpa ? "moderate" : "low";

  const insights = [
    nextStage
      ? `${nextStage.label} is ${Math.max(0, Math.round(nextStage.gdd - currentGdd))} GDD away at current accumulation.`
      : "The field has reached the final configured stage for this crop profile.",
    `OpenET-style ETc is ${Math.abs(cumulativeEtcMm - cumulativeEtoMm).toFixed(1)} mm ${cumulativeEtcMm >= cumulativeEtoMm ? "above" : "below"} reference ETo for the selected period.`,
    latestVpd && latestVpd >= crop.stress.highVpdKpa
      ? `VPD is elevated at ${latestVpd} kPa; water demand should be watched closely.`
      : "Current atmospheric demand is within the normal operating range.",
  ];

  return {
    field,
    crop,
    records,
    currentGdd,
    currentStage,
    nextStage,
    currentKc,
    cumulativeEtcMm: Number(cumulativeEtcMm.toFixed(1)),
    cumulativeEtoMm,
    chillPortions,
    chillRequirement: crop.chillRequirementPortions,
    stressLevel,
    vpdKpa: latestVpd,
    insights,
  };
}
