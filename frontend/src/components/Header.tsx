import { useState } from "react";
import { Menu, X } from "lucide-react";

interface HeaderProps {
  activeView: string;
  canViewAnalytics: boolean;
  onViewChange: (view: string) => void;
}

export function Header({ activeView, canViewAnalytics, onViewChange }: HeaderProps) {
  const homeActive = activeView === "Home";
  const analyticsActive = activeView === "Analytics" && canViewAnalytics;
  // Home and Analytics aside, every remaining view renders the field manager, so
  // the Fields tab is active whenever neither of those is.
  const fieldsActive = !homeActive && !analyticsActive;
  // On phones the nav collapses behind a hamburger; picking a destination closes it.
  const [menuOpen, setMenuOpen] = useState(false);

  function selectView(view: string) {
    onViewChange(view);
    setMenuOpen(false);
  }

  return (
    <header className="topbar">
      <button type="button" className="brand brand-button" onClick={() => selectView("Home")}>
        Water 3D
      </button>
      <nav id="primary-nav" className={`main-nav${menuOpen ? " nav-open" : ""}`} aria-label="Primary">
        <button
          type="button"
          className={homeActive ? "nav-active" : ""}
          aria-current={homeActive ? "page" : undefined}
          onClick={() => selectView("Home")}
        >
          Home
        </button>
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
          className={fieldsActive ? "nav-active" : ""}
          aria-current={fieldsActive ? "page" : undefined}
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
      </div>
    </header>
  );
}
