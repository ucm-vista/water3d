import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOpenEtPointTimeseriesBody, getSupportedOpenEtDateRange, OpenEtProvider } from "./openEt";
import { openEtConfig } from "../config/openet";

const baseRequest = {
  cropId: "almond" as const,
  lat: 36.7378,
  lon: -119.7871,
};
const originalMaxAvailableDate = openEtConfig.maxAvailableDate;

describe("OpenET API client", () => {
  afterEach(() => {
    openEtConfig.maxAvailableDate = originalMaxAvailableDate;
    vi.restoreAllMocks();
  });

  it("does not allow configured-unavailable future ranges to reach fetch", () => {
    openEtConfig.maxAvailableDate = "2025-12-31";

    expect(() =>
      getSupportedOpenEtDateRange({
        ...baseRequest,
        startDate: "2026-05-03",
        endDate: "2026-06-01",
      }),
    ).toThrow("OpenET data is currently configured through 2025-12-31");
  });

  it("caps ranges that cross the configured availability date", () => {
    openEtConfig.maxAvailableDate = "2025-12-31";

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

  it("requests only variables required by the dashboard analytics path", () => {
    expect(openEtConfig.variables.requiredForWater3d).toEqual(["ET", "ETo"]);
  });

  it("deduplicates concurrent requests for the same field and date range", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { variable: string };

      return {
        ok: true,
        json: async () => [{ date: "2025-06-01", [body.variable]: 5 }],
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenEtProvider();
    const request = {
      ...baseRequest,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    };

    await Promise.all([provider.getEtData(request), provider.getEtData(request)]);

    const openEtCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/openet/raster/timeseries/point"));
    expect(openEtCalls).toHaveLength(2);
  });
});
