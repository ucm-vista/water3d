import React from "react";
import { LogIn, LogOut, UserCircle, UserPlus } from "lucide-react";
import type { AuthSession } from "../backend/authRepository";

interface AuthStatusProps {
  session: AuthSession;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, passwordConfirm: string) => Promise<void>;
  onLogout: () => void;
}

type AuthMode = "login" | "register";

export function AuthStatus({ session, onLogin, onRegister, onLogout }: AuthStatusProps) {
  const [mode, setMode] = React.useState<AuthMode>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isRegister = mode === "register";

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setPassword("");
    setPasswordConfirm("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isRegister && password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isRegister) {
        await onRegister(email, password, passwordConfirm);
      } else {
        await onLogin(email, password);
      }
      // Leave the popover open: the session flips to the authenticated view
      // (email + Log out), giving visible confirmation the action worked.
      setPassword("");
      setPasswordConfirm("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : isRegister ? "Sign up failed." : "Login failed.");
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
            <span className="account-menu-eyebrow">Account</span>
            <strong>{session.isAuthenticated ? session.email ?? "Signed in" : "Guest mode"}</strong>
            <span>{session.isAuthenticated ? "Signed in · fields saved in this browser" : "Local storage session only"}</span>
          </div>

          {session.isAuthenticated ? (
            <button className="account-menu-action" type="button" onClick={onLogout}>
              <LogOut size={16} />
              Log out
            </button>
          ) : session.isEnabled ? (
            <>
              <div className="auth-tabs" role="tablist" aria-label="Account mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isRegister}
                  className={`auth-tab ${!isRegister ? "auth-tab-active" : ""}`}
                  onClick={() => switchMode("login")}
                >
                  Log in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isRegister}
                  className={`auth-tab ${isRegister ? "auth-tab-active" : ""}`}
                  onClick={() => switchMode("register")}
                >
                  Sign up
                </button>
              </div>

              <form className="auth-popover" onSubmit={handleSubmit}>
                <label>
                  Email
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
                </label>
                <label>
                  Password
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    minLength={isRegister ? 8 : undefined}
                    required
                  />
                </label>
                {isRegister ? (
                  <label>
                    Confirm password
                    <input
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </label>
                ) : null}
                {error ? (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <button type="submit" disabled={isSubmitting}>
                  {isRegister ? <UserPlus size={16} /> : <LogIn size={16} />}
                  {isSubmitting ? (isRegister ? "Creating account..." : "Signing in...") : isRegister ? "Create account" : "Log in"}
                </button>
              </form>
            </>
          ) : (
            <p className="account-menu-note">PocketBase is disabled. Fields will stay in this browser session.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
