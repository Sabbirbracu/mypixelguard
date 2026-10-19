import { useEffect, useState } from "react";
import { useApp } from "./store";
import { t } from "./i18n";
import { TOOLS, type Tool } from "./types";
import { EmptyState, SettingsDialog, Sidebar, WorkspaceBar } from "./components/shell";
import InspectView from "./tools/Inspect";
import CleanView from "./tools/Clean";
import RedactView from "./tools/Redact";
import ConvertView from "./tools/Convert";
import ResizeView from "./tools/Resize";
import CompressView from "./tools/Compress";
import BackgroundView from "./tools/Background";
import StudioView from "./tools/Studio";
import AiToolsView from "./tools/AiTools";

function ToolDetail({ tool }: { tool: Tool }) {
  switch (tool) {
    case "inspect": return <InspectView />;
    case "clean": return <CleanView />;
    case "redact": return <RedactView />;
    case "convert": return <ConvertView />;
    case "resize": return <ResizeView />;
    case "compress": return <CompressView />;
    case "background": return <BackgroundView />;
    case "studio": return <StudioView />;
    case "enhance": return <AiToolsView />;
  }
}

export default function App() {
  const init = useApp((s) => s.init);
  const lang = useApp((s) => s.lang);
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  const hasFiles = useApp((s) => s.files.length > 0);
  const chooseImages = useApp((s) => s.chooseImages);
  const [settings, setSettings] = useState(false);

  useEffect(() => { void init(); }, [init]);

  // Ctrl+1…9 switch tools, Ctrl+O adds images.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TOOLS.length) { e.preventDefault(); setTool(TOOLS[n - 1]); }
      else if (e.key.toLowerCase() === "o") { e.preventDefault(); void chooseImages(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setTool, chooseImages]);

  // Rebuild the window content when the language changes so every string is looked up again.
  return (
    <div className="app" key={lang}>
      <Sidebar onSettings={() => setSettings(true)} />
      <main className="main">
        {hasFiles ? (<><WorkspaceBar /><ToolDetail tool={tool} /></>) : <EmptyState />}
        <div className="drop-overlay" id="drop-overlay" style={{ display: "none" }}>{t("drop.hint")}</div>
      </main>
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
    </div>
  );
}
