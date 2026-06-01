import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { FieldManager } from "./components/FieldManager";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { loadFields, saveFields } from "./utils/storage";
import type { FieldConfig } from "./types/domain";

export function App() {
  const [fields, setFields] = useState<FieldConfig[]>(() => loadFields());
  const [selectedFieldId, setSelectedFieldId] = useState(fields[0]?.id ?? "");
  const [activeView, setActiveView] = useState("Analytics");

  useEffect(() => {
    saveFields(fields);
  }, [fields]);

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedFieldId) ?? fields[0],
    [fields, selectedFieldId],
  );

  function handleCreateField(field: FieldConfig) {
    setFields((current) => [...current, field]);
    setSelectedFieldId(field.id);
    setActiveView("Analytics");
  }

  function handleUpdateField(field: FieldConfig) {
    setFields((current) => current.map((existing) => (existing.id === field.id ? field : existing)));
    setSelectedFieldId(field.id);
  }

  return (
    <div className="app-shell">
      <Header
        fields={fields}
        selectedFieldId={selectedField?.id ?? ""}
        activeView={activeView}
        onFieldChange={setSelectedFieldId}
        onViewChange={setActiveView}
      />
      <div className="body-shell">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        {activeView === "Fields" ? (
          <FieldManager
            fields={fields}
            selectedFieldId={selectedField?.id ?? ""}
            onSelectField={setSelectedFieldId}
            onCreateField={handleCreateField}
            onUpdateField={handleUpdateField}
          />
        ) : activeView === "Analytics" && selectedField ? (
          <Dashboard field={selectedField} />
        ) : (
          <FieldManager
            fields={fields}
            selectedFieldId={selectedField?.id ?? ""}
            onSelectField={setSelectedFieldId}
            onCreateField={handleCreateField}
            onUpdateField={handleUpdateField}
          />
        )}
      </div>
      <footer className="footer">
        <strong>Water 3D</strong>
        <span>Hydrological Precision - Analytics v0.1</span>
        <span>System Status: Optimal</span>
      </footer>
    </div>
  );
}
