import React from "react";
import { LogIn, LogOut, UserCircle } from "lucide-react";
import type { AuthSession } from "../backend/authRepository";

interface AuthStatusProps {
  session: AuthSession;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => void;
}

export function AuthStatus({ session, onLogin, onLogout }: AuthStatusProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onLogin(email, password);
      setPassword("");
      setIsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="account-control">
      <button
        className={`account-button ${session.isAuthenticated ? "account-button-active" : ""}`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        title={session.isAuthenticated ? `Signed in${session.email ? ` as ${session.email}` : ""}` : "Guest mode"}
      >
        <UserCircle size={24} />
      </button>

      {isOpen ? (
        <div className="account-menu">
          <div className="account-menu-status">
            <strong>{session.isAuthenticated ? session.email ?? "Signed in" : "Guest mode"}</strong>
            <span>{session.isAuthenticated ? "PocketBase storage" : "Local storage session only"}</span>
          </div>

          {session.isAuthenticated ? (
            <button className="account-menu-action" type="button" onClick={onLogout}>
              <LogOut size={16} />
              Log out
            </button>
          ) : session.isEnabled ? (
            <form className="auth-popover" onSubmit={handleSubmit}>
              <label>
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label>
                Password
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
              </label>
              {error ? <p>{error}</p> : null}
              <button type="submit" disabled={isSubmitting}>
                <LogIn size={16} />
                {isSubmitting ? "Signing in..." : "Log in"}
              </button>
            </form>
          ) : (
            <p className="account-menu-note">PocketBase is disabled. Fields will stay in this browser session.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
