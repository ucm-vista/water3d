import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { QueryProvider } from "./api/QueryProvider";
import { UnitsProvider } from "./state/UnitsContext";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <UnitsProvider>
        <App />
      </UnitsProvider>
    </QueryProvider>
  </StrictMode>,
);
