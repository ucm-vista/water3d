import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { AuthSession } from "../backend/authRepository";
import { AuthStatus } from "./AuthStatus";

interface HeaderProps {
  activeView: string;
  canViewAnalytics: boolean;
  authSession: AuthSession;
  onViewChange: (view: string) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, passwordConfirm: string) => Promise<void>;
  onLogout: () => void;
}

export function Header({ activeView, canViewAnalytics, authSession, onViewChange, onLogin, onRegister, onLogout }: HeaderProps) {
  // Any view that isn't "Analytics" renders the field manager, so the Fields tab
  // is active whenever Analytics is not.
  const analyticsActive = activeView === "Analytics" && canViewAnalytics;
  // On phones the nav collapses behind a hamburger; picking a destination closes it.
  const [menuOpen, setMenuOpen] = useState(false);

  function selectView(view: string) {
    onViewChange(view);
    setMenuOpen(false);
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="brand brand-button"
        onClick={() => {
          if (canViewAnalytics) selectView("Analytics");
        }}
      >
        Water 3D
      </button>
      <nav id="primary-nav" className={`main-nav${menuOpen ? " nav-open" : ""}`} aria-label="Primary">
        <button
          type="button"
          className={analyticsActive ? "nav-active" : ""}
          aria-current={analyticsActive ? "page" : undefined}
          disabled={!canViewAnalytics}
          onClick={() => selectView("Analytics")}
        >
          Analytics
        </button>
        <button
          type="button"
          className={!analyticsActive ? "nav-active" : ""}
          aria-current={!analyticsActive ? "page" : undefined}
          onClick={() => selectView("Fields")}
        >
          Fields
        </button>
      </nav>
      <div className="header-actions">
        <button
          type="button"
          className="nav-toggle"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <AuthStatus session={authSession} onLogin={onLogin} onRegister={onRegister} onLogout={onLogout} />
      </div>
    </header>
  );
}
