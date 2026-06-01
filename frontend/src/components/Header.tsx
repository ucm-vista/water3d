import { Bell, Rows3, UserCircle } from "lucide-react";
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
      <div />
      <div className="header-actions">
        <button className="manage-fields-button" onClick={() => onViewChange("Fields")}>
          <Rows3 size={16} />
          Manage Fields
        </button>
        <AuthStatus />
        <Bell size={22} />
        <UserCircle size={24} />
      </div>
    </header>
  );
}
