import { useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { FieldManager } from "./components/FieldManager";
import { FieldSidebar } from "./components/FieldSidebar";
import { Header } from "./components/Header";
import { Home } from "./components/Home";
import { loadFields, saveFields } from "./utils/storage";
import type { FieldConfig } from "./types/domain";

export function App() {
  const [fields, setFields] = useState<FieldConfig[]>(() => loadFields());
  const [selectedFieldId, setSelectedFieldId] = useState(fields[0]?.id ?? "");
  // New users (no fields) land on Home; returning users go straight to Analytics.
  const [activeView, setActiveView] = useState(() => (fields.length ? "Analytics" : "Home"));

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedFieldId) ?? fields[0],
    [fields, selectedFieldId],
  );

  function persistFields(nextFields: FieldConfig[]) {
    setFields(nextFields);
    saveFields(nextFields);
  }

  function handleSelectField(fieldId: string) {
    setSelectedFieldId(fieldId);
    setActiveView("Analytics");
  }

  function handleCreateField(field: FieldConfig) {
    persistFields([...fields, field]);
    setSelectedFieldId(field.id);
    setActiveView("Analytics");
  }

  function handleUpdateField(field: FieldConfig) {
    persistFields(fields.map((existing) => (existing.id === field.id ? field : existing)));
    setSelectedFieldId(field.id);
  }

  return (
    <div className="app-shell">
      <Header activeView={activeView} canViewAnalytics={Boolean(selectedField)} onViewChange={setActiveView} />
      <div className="body-shell">
        {activeView === "Home" ? (
          <Home hasFields={fields.length > 0} onGetStarted={() => setActiveView("Fields")} />
        ) : activeView === "Analytics" && selectedField ? (
          <div className="analytics-shell">
            <FieldSidebar
              key={selectedField.id}
              field={selectedField}
              fields={fields}
              onSelectField={setSelectedFieldId}
              onUpdateField={handleUpdateField}
            />
            <Dashboard field={selectedField} />
          </div>
        ) : (
          <FieldManager
            fields={fields}
            selectedFieldId={selectedField?.id ?? ""}
            onSelectField={handleSelectField}
            onCreateField={handleCreateField}
            onUpdateField={handleUpdateField}
          />
        )}
      </div>
    </div>
  );
}
