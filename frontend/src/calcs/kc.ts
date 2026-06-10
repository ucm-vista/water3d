import type { CropProfile } from "../types/domain";

export function interpolateKc(crop: CropProfile, seasonProgress: number): number {
  const progress = Math.min(1, Math.max(0, seasonProgress));
  const points = crop.kcCurve;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (progress >= current.position && progress <= next.position) {
      const span = next.position - current.position || 1;
      const ratio = (progress - current.position) / span;
      return Number((current.kc + (next.kc - current.kc) * ratio).toFixed(2));
    }
  }

  return points[points.length - 1].kc;
}

export function seasonProgressFromGdd(crop: CropProfile, cumulativeGdd: number): number {
  const terminalStage = [...crop.stages].reverse().find((stage) => typeof stage.gdd === "number" && stage.gdd > 0);
  return terminalStage?.gdd ? cumulativeGdd / terminalStage.gdd : 0;
}
