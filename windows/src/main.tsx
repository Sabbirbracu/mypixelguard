import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

async function start() {
  // Browser-only preview with real captured data (never part of the shipped app).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock") && !("__TAURI_INTERNALS__" in window)) {
    await (await import("./dev/mock")).installMock();
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void start();
