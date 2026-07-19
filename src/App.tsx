import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Tabs from "./components/Tabs";
import RequestBuilder from "./components/RequestBuilder";
import ResponseViewer from "./components/ResponseViewer";
import EnvironmentPanel from "./components/EnvironmentPanel";
import PromptModal from "./components/PromptModal";
import { useStore } from "./lib/store";

export default function App() {
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const activeTabPath = useStore((s) => s.activeTabPath);
  const saveTab = useStore((s) => s.saveTab);
  const sendTabRequest = useStore((s) => s.sendTabRequest);
  const [envPanelOpen, setEnvPanelOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !activeTabPath) return;
      if (e.key === "s") {
        e.preventDefault();
        saveTab(activeTabPath);
      } else if (e.key === "Enter") {
        e.preventDefault();
        sendTabRequest(activeTabPath);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabPath, saveTab, sendTabRequest]);

  return (
    <div className="h-full flex text-text">
      <Sidebar onManageEnv={() => setEnvPanelOpen(true)} />

      {!workspaceRoot ? (
        <div className="flex-1" />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs />
          <div className="flex-1 flex min-h-0">
            <RequestBuilder />
            <ResponseViewer />
          </div>
        </div>
      )}

      {envPanelOpen && <EnvironmentPanel onClose={() => setEnvPanelOpen(false)} />}

      <PromptModal />
    </div>
  );
}
