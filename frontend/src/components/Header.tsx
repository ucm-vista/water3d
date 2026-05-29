import { Bell, Plus, UserCircle } from "lucide-react";
import type { FieldConfig } from "../types/domain";
import { AuthStatus } from "./AuthStatus";

interface HeaderProps {
  fields: FieldConfig[];
  selectedFieldId: string;
  activeView: string;
  onFieldChange: (fieldId: string) => void;
  onViewChange: (view: string) => void;
}

export function Header({ fields, selectedFieldId, activeView, onFieldChange, onViewChange }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">Water 3D</div>
      <select className="field-select" value={selectedFieldId} onChange={(event) => onFieldChange(event.target.value)}>
        {fields.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name} - {field.cropLabel}
          </option>
        ))}
      </select>
      <nav className="main-nav" aria-label="Primary">
        <button className={activeView === "Analytics" ? "nav-active" : ""} onClick={() => onViewChange("Analytics")}>
          Analytics
        </button>
        <button className="add-field-link" onClick={() => onViewChange("Setup")}>
          <Plus size={18} />
          Add Field
        </button>
      </nav>
      <div className="header-actions">
        <AuthStatus />
        <Bell size={22} />
        <UserCircle size={24} />
      </div>
    </header>
  );
}
