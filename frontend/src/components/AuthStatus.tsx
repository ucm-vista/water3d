import { Lock, ShieldCheck } from "lucide-react";
import { getAuthSession } from "../backend/authRepository";

export function AuthStatus() {
  const session = getAuthSession();

  return (
    <div className="auth-status" title={session.isEnabled ? "PocketBase auth adapter is available." : "PocketBase is scaffolded but disabled."}>
      {session.isEnabled ? <ShieldCheck size={16} /> : <Lock size={16} />}
      <span>{session.isEnabled ? (session.isAuthenticated ? "Signed in" : "Auth ready") : "Local mode"}</span>
    </div>
  );
}
