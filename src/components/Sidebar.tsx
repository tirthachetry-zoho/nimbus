import { FolderOpen, FolderPlus, FilePlus, Layers, ChevronDown, Download, Upload } from "lucide-react";
import { useState } from "react";
import { useStore } from "../lib/store";
import * as api from "../lib/tauriApi";
import CollectionTree from "./CollectionTree";

export default function Sidebar({ onManageEnv }: { onManageEnv: () => void }) {
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const tree = useStore((s) => s.tree);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const createFolder = useStore((s) => s.createFolder);
  const createRequest = useStore((s) => s.createRequest);
  const environments = useStore((s) => s.environments);
  const activeEnvPath = useStore((s) => s.activeEnvPath);
  const setActiveEnv = useStore((s) => s.setActiveEnv);
  const importPostman = useStore((s) => s.importPostman);
  const importBruno = useStore((s) => s.importBruno);
  const exportPostman = useStore((s) => s.exportPostman);
  const prompt = useStore((s) => s.prompt);
  const [envOpen, setEnvOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function handlePickWorkspace() {
    const dir = await api.pickFolder();
    if (dir) await openWorkspace(dir);
  }

  if (!workspaceRoot) {
    return (
      <div className="w-72 shrink-0 bg-panel border-r border-border flex flex-col items-center justify-center p-6 gap-3">
        <div className="text-accent font-mono text-lg font-semibold">Nimbus</div>
        <p className="text-muted text-xs text-center leading-relaxed">
          Open a folder to use as your workspace. Collections are just plain-text files on disk —
          commit them to git alongside your code.
        </p>
        <button
          onClick={handlePickWorkspace}
          className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-accent text-base rounded-sm text-sm font-medium hover:brightness-110"
        >
          <FolderOpen size={14} />
          Open Workspace
        </button>
      </div>
    );
  }

  const activeEnv = environments.find((e) => e.path === activeEnvPath);

  return (
    <div className="w-72 shrink-0 bg-panel border-r border-border flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <span className="font-mono text-accent font-semibold text-sm truncate">
          {workspaceRoot.split(/[/\\]/).pop()}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            title="New request"
            className="p-1 text-muted hover:text-accent"
            onClick={async () => {
              const name = await prompt("Request name");
              if (name) createRequest(workspaceRoot, name);
            }}
          >
            <FilePlus size={14} />
          </button>
          <button
            title="New folder"
            className="p-1 text-muted hover:text-accent"
            onClick={async () => {
              const name = await prompt("Folder name");
              if (name) createFolder(workspaceRoot, name);
            }}
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* import / export toolbar */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 relative">
        <div className="relative">
          <button
            className="flex items-center gap-1.5 text-xs text-muted hover:text-accent"
            onClick={() => setImportOpen((o) => !o)}
          >
            <Upload size={13} /> Import
          </button>
          {importOpen && (
            <div className="absolute z-20 left-0 mt-1 bg-panel2 border border-border rounded-sm shadow-lg overflow-hidden w-40">
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-base"
                onClick={() => {
                  setImportOpen(false);
                  importPostman();
                }}
              >
                Postman v2.1…
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-base"
                onClick={() => {
                  setImportOpen(false);
                  importBruno();
                }}
              >
                Bruno folder…
              </button>
            </div>
          )}
        </div>
        <button
          className="flex items-center gap-1.5 text-xs text-muted hover:text-accent"
          onClick={() => exportPostman()}
        >
          <Download size={13} /> Export
        </button>
      </div>

      <div className="relative border-b border-border">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-panel2"
          onClick={() => setEnvOpen((o) => !o)}
        >
          <Layers size={13} className="text-muted" />
          <span className="truncate">{activeEnv ? activeEnv.env.name : "No environment"}</span>
          <ChevronDown size={13} className="ml-auto text-muted" />
        </button>
        {envOpen && (
          <div className="absolute z-10 left-0 right-0 bg-panel2 border border-border rounded-sm shadow-lg mx-2 mt-0.5 overflow-hidden">
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-base"
              onClick={() => {
                setActiveEnv(null);
                setEnvOpen(false);
              }}
            >
              No environment
            </button>
            {environments.map((e) => (
              <button
                key={e.path}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-base truncate"
                onClick={() => {
                  setActiveEnv(e.path);
                  setEnvOpen(false);
                }}
              >
                {e.env.name}
              </button>
            ))}
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-accent hover:bg-base border-t border-border"
              onClick={() => {
                setEnvOpen(false);
                onManageEnv();
              }}
            >
              Manage environments…
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {tree.length === 0 ? (
          <p className="text-muted text-xs px-3 py-2">No requests yet. Use the icons above to create one.</p>
        ) : (
          <CollectionTree nodes={tree} />
        )}
      </div>
    </div>
  );
}