import { useEffect, useMemo, useState } from "react";
import type { AuthSession } from "./backend/authRepository";
import { getAuthSession, loginWithPassword, logout, onAuthChange } from "./backend/authRepository";
import { loadFieldStorage, saveFieldStorage } from "./backend/fieldStorage";
import { Dashboard } from "./components/Dashboard";
import { FieldManager } from "./components/FieldManager";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { loadFields } from "./utils/storage";
import type { FieldConfig } from "./types/domain";

export function App() {
  const [fields, setFields] = useState<FieldConfig[]>(() => loadFields());
  const [selectedFieldId, setSelectedFieldId] = useState(fields[0]?.id ?? "");
  const [activeView, setActiveView] = useState("Analytics");
  const [authSession, setAuthSession] = useState<AuthSession>(() => getAuthSession());
  const [storageStatus, setStorageStatus] = useState("Local storage");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    return onAuthChange((session) => {
      setAuthSession(session);
    });
  }, []);

  useEffect(() => {
    let ignore = false;

    async function hydrateFields() {
      const state = await loadFieldStorage();
      if (ignore) {
        return;
      }

      setFields(state.fields);
      setSelectedFieldId((current) => (state.fields.some((field) => field.id === current) ? current : state.fields[0]?.id ?? ""));
      setStorageStatus(state.source === "pocketbase" ? "PocketBase storage" : "Local storage");
      setStorageWarning(state.warning ?? null);
    }

    void hydrateFields();

    return () => {
      ignore = true;
    };
  }, [authSession.isAuthenticated]);

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedFieldId) ?? fields[0],
    [fields, selectedFieldId],
  );

  async function persistFields(nextFields: FieldConfig[], changedField: FieldConfig) {
    setFields(nextFields);
    const state = await saveFieldStorage(nextFields, changedField);
    setFields(state.fields);
    setStorageStatus(state.source === "pocketbase" ? "PocketBase storage" : "Local storage");
    setStorageWarning(state.warning ?? null);
  }

  function handleCreateField(field: FieldConfig) {
    const nextFields = [...fields, field];
    void persistFields(nextFields, field);
    setSelectedFieldId(field.id);
    setActiveView("Analytics");
  }

  function handleUpdateField(field: FieldConfig) {
    const nextFields = fields.map((existing) => (existing.id === field.id ? field : existing));
    void persistFields(nextFields, field);
    setSelectedFieldId(field.id);
  }

  async function handleLogin(email: string, password: string) {
    const session = await loginWithPassword({ email, password });
    setAuthSession(session);
  }

  function handleLogout() {
    logout();
    setAuthSession(getAuthSession());
    setStorageStatus("Local storage");
    setStorageWarning(null);
  }

  return (
    <div className="app-shell">
      <Header
        fields={fields}
        selectedFieldId={selectedField?.id ?? ""}
        activeView={activeView}
        authSession={authSession}
        onFieldChange={setSelectedFieldId}
        onViewChange={setActiveView}
        onLogin={handleLogin}
        onLogout={handleLogout}
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
        <span>{storageWarning ?? storageStatus}</span>
      </footer>
    </div>
  );
}
