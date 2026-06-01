import type { AuthModel } from "pocketbase";
import { getPocketBaseClient, isPocketBaseEnabled } from "./pocketbaseClient";

export interface AuthSession {
  isEnabled: boolean;
  isAuthenticated: boolean;
  user: AuthModel | null;
  token: string;
  email?: string;
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
    email: getUserEmail(pb.authStore.model),
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

export function onAuthChange(callback: (session: AuthSession) => void): () => void {
  if (!isPocketBaseEnabled()) {
    return () => undefined;
  }

  const unsubscribe = getPocketBaseClient().authStore.onChange(() => {
    callback(getAuthSession());
  }, true);

  return unsubscribe;
}

function getUserEmail(user: AuthModel | null): string | undefined {
  if (!user || typeof user !== "object") {
    return undefined;
  }

  const maybeEmail = (user as Record<string, unknown>).email;
  return typeof maybeEmail === "string" ? maybeEmail : undefined;
}
