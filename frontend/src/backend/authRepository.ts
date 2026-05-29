import type { AuthModel } from "pocketbase";
import { getPocketBaseClient, isPocketBaseEnabled } from "./pocketbaseClient";

export interface AuthSession {
  isEnabled: boolean;
  isAuthenticated: boolean;
  user: AuthModel | null;
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export function getAuthSession(): AuthSession {
  if (!isPocketBaseEnabled()) {
    return {
      isEnabled: false,
      isAuthenticated: false,
      user: null,
      token: "",
    };
  }

  const pb = getPocketBaseClient();
  return {
    isEnabled: true,
    isAuthenticated: pb.authStore.isValid,
    user: pb.authStore.model,
    token: pb.authStore.token,
  };
}

export async function loginWithPassword(credentials: LoginCredentials): Promise<AuthSession> {
  if (!isPocketBaseEnabled()) {
    throw new Error("PocketBase auth is scaffolded but disabled.");
  }

  const pb = getPocketBaseClient();
  await pb.collection("users").authWithPassword(credentials.email, credentials.password);
  return getAuthSession();
}

export function logout(): void {
  if (!isPocketBaseEnabled()) return;
  getPocketBaseClient().authStore.clear();
}
