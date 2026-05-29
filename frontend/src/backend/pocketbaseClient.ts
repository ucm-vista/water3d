import PocketBase from "pocketbase";
import { backendConfig } from "../config/backend";

let client: PocketBase | null = null;

export function getPocketBaseClient(): PocketBase {
  if (!client) {
    client = new PocketBase(backendConfig.pocketBaseUrl);
    client.autoCancellation(false);
  }

  return client;
}

export function isPocketBaseEnabled(): boolean {
  return backendConfig.pocketBaseEnabled;
}
