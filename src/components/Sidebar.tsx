import { FolderOpen, FolderPlus, FilePlus, Layers, ChevronDown, Download, Upload } from "lucide-react";
import { useState } from "react";
import { useStore } from "../lib/store";
import * as api from "../lib/tauriApi";
import CollectionTree from "./CollectionTree";

function AuthorFooter() {
  return (
    <div className="w-full px-3 py-2 border-t border-border text-xs text-muted flex items-center gap-1.5">
      <span>Made by</span>
      <a
        href="https://www.linkedin.com/in/tirthachetry/"
        target="_blank"
        rel="noreferrer"
        className="text-accent hover:underline"
      >
        Tirtha Chetry
      </a>
    </div>
  );
}

export default function Sidebar({ onManageEnv }: { onManageEnv: () => void }) {
  const workspaceRoot = useStore((s) => s.workspaceRoot);
  const workspaces = useStore((s) => s.workspaces);
  const tree = useStore((s) => s.tree);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const switchWorkspace = useStore((s) => s.switchWorkspace);
  const removeRecentWorkspace = useStore((s) => s.removeRecentWorkspace);
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
  const [recentOpen, setRecentOpen] = useState(false);

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
        {workspaces.length > 0 && (
          <div className="w-full mt-4 pt-4 border-t border-border">
            <p className="text-muted text-xs mb-2">Recent workspaces</p>
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <button
                  key={ws}
                  onClick={() => switchWorkspace(ws)}
                  className="w-full text-left px-2 py-1.5 text-xs text-text hover:bg-panel2 rounded truncate"
                  title={ws}
                >
                  {ws.split(/[/\\]/).pop()}
                </button>
              ))}
            </div>
          </div>
            )}
        <AuthorFooter />
      </div>
    );
  }

  const activeEnv = environments.find((e) => e.path === activeEnvPath);

  return (
    <div className="w-72 shrink-0 bg-panel border-r border-border flex flex-col">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
        <div className="relative">
          <button
            className="font-mono text-accent font-semibold text-sm truncate hover:opacity-80"
            onClick={() => setRecentOpen((o) => !o)}
          >
            {workspaceRoot.split(/[/\\]/).pop()}
          </button>
          {recentOpen && (
            <div className="absolute z-20 left-0 mt-1 bg-panel2 border border-border rounded-sm shadow-lg overflow-hidden w-48">
              {workspaces.length > 0 && workspaces.map((ws) => (
                <button
                  key={ws}
                  onClick={() => {
                    switchWorkspace(ws);
                    setRecentOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-base truncate flex items-center justify-between group"
                  title={ws}
                >
                  <span className="truncate">{ws.split(/[/\\]/).pop()}</span>
                  {ws !== workspaceRoot && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentWorkspace(ws);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-500"
                    >
                      ×
                    </button>
                  )}
                </button>
              ))}
              {workspaces.length === 0 && (
                <div className="px-3 py-1.5 text-sm text-muted">No recent workspaces</div>
              )}
            </div>
          )}
        </div>
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
      <AuthorFooter />
    </div>
  );
}
