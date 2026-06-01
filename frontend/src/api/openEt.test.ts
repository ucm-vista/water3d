import { describe, expect, it } from "vitest";
import { buildOpenEtPointTimeseriesBody, getSupportedOpenEtDateRange } from "./openEt";

const baseRequest = {
  cropId: "almond" as const,
  lat: 36.7378,
  lon: -119.7871,
};

describe("OpenET API client", () => {
  it("does not allow configured-unavailable future ranges to reach fetch", () => {
    expect(() =>
      getSupportedOpenEtDateRange({
        ...baseRequest,
        startDate: "2026-05-03",
        endDate: "2026-06-01",
      }),
    ).toThrow("OpenET data is currently configured through 2025-12-31");
  });

  it("caps ranges that cross the configured availability date", () => {
    expect(
      getSupportedOpenEtDateRange({
        ...baseRequest,
        startDate: "2025-12-01",
        endDate: "2026-01-15",
      }),
    ).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-31",
    });
  });

  it("uses the gridMET dataset version for reference ET and precipitation variables", () => {
    expect(
      buildOpenEtPointTimeseriesBody({
        ...baseRequest,
        startDate: "2025-06-01",
        endDate: "2025-06-30",
        variable: "ETo",
      }).version,
    ).toBe(1);

    expect(
      buildOpenEtPointTimeseriesBody({
        ...baseRequest,
        startDate: "2025-06-01",
        endDate: "2025-06-30",
        variable: "PR",
      }).version,
    ).toBe(1);
  });
});
