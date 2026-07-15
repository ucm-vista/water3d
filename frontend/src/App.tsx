import { useEffect, useMemo, useState } from "react";
import type { AuthSession } from "./backend/authRepository";
import { getAuthSession, loginWithPassword, logout, onAuthChange, registerWithPassword } from "./backend/authRepository";
import { loadFieldStorage, saveFieldStorage } from "./backend/fieldStorage";
import { Dashboard } from "./components/Dashboard";
import { FieldManager } from "./components/FieldManager";
import { FieldSidebar } from "./components/FieldSidebar";
import { Header } from "./components/Header";
import { Home } from "./components/Home";
import { loadFields } from "./utils/storage";
import type { FieldConfig } from "./types/domain";

export function App() {
  const [fields, setFields] = useState<FieldConfig[]>(() => loadFields());
  const [selectedFieldId, setSelectedFieldId] = useState(fields[0]?.id ?? "");
  // New users (no fields) land on Home; returning users go straight to Analytics.
  const [activeView, setActiveView] = useState(() => (fields.length ? "Analytics" : "Home"));
  const [authSession, setAuthSession] = useState<AuthSession>(() => getAuthSession());

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
  }

  function handleSelectField(fieldId: string) {
    setSelectedFieldId(fieldId);
    setActiveView("Analytics");
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

  async function handleRegister(email: string, password: string, passwordConfirm: string) {
    const session = await registerWithPassword({ email, password, passwordConfirm });
    setAuthSession(session);
  }

  function handleLogout() {
    logout();
    setAuthSession(getAuthSession());
  }

  return (
    <div className="app-shell">
      <Header
        activeView={activeView}
        canViewAnalytics={Boolean(selectedField)}
        authSession={authSession}
        onViewChange={setActiveView}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onLogout={handleLogout}
      />
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
