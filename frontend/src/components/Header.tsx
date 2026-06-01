import { Bell, Rows3 } from "lucide-react";
import type { AuthSession } from "../backend/authRepository";
import type { FieldConfig } from "../types/domain";
import { AuthStatus } from "./AuthStatus";

interface HeaderProps {
  fields: FieldConfig[];
  selectedFieldId: string;
  activeView: string;
  authSession: AuthSession;
  onFieldChange: (fieldId: string) => void;
  onViewChange: (view: string) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onLogout: () => void;
}

export function Header({ fields, selectedFieldId, activeView, authSession, onFieldChange, onViewChange, onLogin, onLogout }: HeaderProps) {
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
      <div />
      <div className="header-actions">
        <button className="manage-fields-button" onClick={() => onViewChange("Fields")}>
          <Rows3 size={16} />
          Manage Fields
        </button>
        <Bell size={22} />
        <AuthStatus session={authSession} onLogin={onLogin} onLogout={onLogout} />
      </div>
    </header>
  );
}
