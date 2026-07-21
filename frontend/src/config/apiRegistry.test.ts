import { describe, expect, it } from "vitest";
import { API_REGISTRY } from "./apiRegistry";
import { climateToolboxConfig } from "./climate";
import { gridMetConfig } from "./gridmet";
import { openMeteoConfig } from "./openMeteo";

function entry(id: string) {
  const found = API_REGISTRY.find((item) => item.id === id);
  if (!found) throw new Error(`registry entry ${id} missing`);
  return found;
}

describe("API_REGISTRY", () => {
  it("has unique ids and the required maintenance fields on every entry", () => {
    const ids = API_REGISTRY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of API_REGISTRY) {
      expect(item.name).toBeTruthy();
      expect(item.role).toBeTruthy();
      expect(item.owner.org).toBeTruthy();
      expect(item.owner.contact).toBeTruthy();
      expect(item.configModule).toMatch(/^src\//);
    }
  });

  it("keeps machine-readable upstream URLs in sync with the live config modules", () => {
    expect(entry("gridmet").upstreamBaseUrl).toBe(gridMetConfig.baseUrl);
    expect(entry("climate-toolbox-cfs").upstreamBaseUrl).toBe(climateToolboxConfig.cfsBaseUrl);
    expect(entry("open-meteo").upstreamBaseUrl).toBe(openMeteoConfig.archiveBaseUrl);
  });

  it("records the pending Climate Toolbox climatology endpoint as gridMET's planned replacement", () => {
    expect(entry("gridmet").plannedReplacement).toMatch(/P10\/P50\/mean/);
  });
});
