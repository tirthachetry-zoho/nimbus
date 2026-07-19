import { create } from "zustand";
import { FsNode, HttpMethod, KeyValue, NimbusEnvironment, NimbusRequest, OpenTab } from "./types";
import { emptyRequest, newId, parseEnvFile, parseRequestFile, serializeEnvFile, serializeRequestFile } from "./bruFormat";
import * as api from "./tauriApi";
import { exportPostmanCollection, importBrunoCollection, importPostmanCollection } from "./importers";

interface AppState {
  workspaceRoot: string | null;
  workspaces: string[];
  tree: FsNode[];
  loadingTree: boolean;

  tabs: OpenTab[];
  activeTabPath: string | null;

  environments: { path: string; env: NimbusEnvironment }[];
  activeEnvPath: string | null;
  globalVars: KeyValue[];
  promptState: {
    open: boolean;
    message: string;
    title: string;
    defaultValue: string;
    resolve: ((value: string | null) => void) | null;
  };

  openWorkspace: (root: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  switchWorkspace: (root: string) => Promise<void>;
  createWorkspace: (root: string) => Promise<void>;
  removeRecentWorkspace: (root: string) => void;

  openRequestFile: (path: string) => Promise<void>;
  newRequestDraft: (folderPath: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateActiveRequest: (patch: Partial<NimbusRequest>) => void;
  saveTab: (path: string) => Promise<void>;
  sendTabRequest: (path: string) => Promise<void>;

  createFolder: (parentPath: string, name: string) => Promise<void>;
  createRequest: (parentPath: string, name: string, method?: HttpMethod) => Promise<void>;
  deleteNode: (path: string) => Promise<void>;
  renameNode: (path: string, newName: string) => Promise<void>;

  loadEnvironments: () => Promise<void>;
  setActiveEnv: (path: string | null) => void;
  createEnvironment: (name: string) => Promise<void>;
  updateEnvironment: (path: string, env: NimbusEnvironment) => Promise<void>;

  prompt: (message: string, title?: string, defaultValue?: string) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;

  importPostman: () => Promise<void>;
  importBruno: () => Promise<void>;
  exportPostman: () => Promise<void>;
}

function activeEnvVars(get: () => AppState): KeyValue[] {
  const { environments, activeEnvPath } = get();
  const found = environments.find((e) => e.path === activeEnvPath);
  return found ? found.env.vars : [];
}

export const useStore = create<AppState>((set, get) => ({
  workspaceRoot: null,
  workspaces: [],
  tree: [],
  loadingTree: false,

  tabs: [],
  activeTabPath: null,

  environments: [],
  activeEnvPath: null,
  globalVars: [],
  promptState: { open: false, message: "", title: "", defaultValue: "", resolve: null },

  openWorkspace: async (root) => {
    // Add to recent workspaces
    const workspaces = get().workspaces.filter(w => w !== root);
    workspaces.unshift(root);
    // Keep only last 10 workspaces
    if (workspaces.length > 10) workspaces.pop();
    
    set({ workspaceRoot: root, workspaces });
    await get().refreshTree();
    await get().loadEnvironments();
  },

  switchWorkspace: async (root) => {
    await get().openWorkspace(root);
  },

  createWorkspace: async (root) => {
    await api.createDirectory(root);
    await get().openWorkspace(root);
  },

  removeRecentWorkspace: (root) => {
    set({ workspaces: get().workspaces.filter(w => w !== root) });
  },

  refreshTree: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;
    set({ loadingTree: true });
    try {
      const tree = await api.listTree(workspaceRoot);
      set({ tree });
    } finally {
      set({ loadingTree: false });
    }
  },

  openRequestFile: async (path) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabPath: path });
      return;
    }
    const content = await api.readTextFile(path);
    const request = parseRequestFile(content);
    const title = path.split(/[/\\]/).pop() || request.name;
    const tab: OpenTab = { path, title, request, dirty: false, response: null, sending: false, responseHistory: [] };
    set({ tabs: [...get().tabs, tab], activeTabPath: path });
  },

  newRequestDraft: (folderPath) => {
    const id = newId();
    const path = `draft:${id}`;
    const request = emptyRequest("Untitled Request");
    const tab: OpenTab = { path, title: "Untitled Request", request, dirty: true, response: null, sending: false, responseHistory: [] };
    (tab as any)._folder = folderPath;
    set({ tabs: [...get().tabs, tab], activeTabPath: path });
  },

  closeTab: (path) => {
    const tabs = get().tabs.filter((t) => t.path !== path);
    let activeTabPath = get().activeTabPath;
    if (activeTabPath === path) {
      activeTabPath = tabs.length ? tabs[tabs.length - 1].path : null;
    }
    set({ tabs, activeTabPath });
  },

  setActiveTab: (path) => set({ activeTabPath: path }),

  updateActiveRequest: (patch) => {
    const { activeTabPath, tabs } = get();
    if (!activeTabPath) return;
    set({
      tabs: tabs.map((t) =>
        t.path === activeTabPath ? { ...t, request: { ...t.request, ...patch }, dirty: true } : t
      ),
    });
  },

  saveTab: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;

    let targetPath = path;
    if (path.startsWith("draft:")) {
      const folder = (tab as any)._folder || get().workspaceRoot;
      const safeName = tab.request.name.trim().replace(/[\\/:*?"<>|]/g, "_") || "Untitled Request";
      targetPath = `${folder}/${safeName}.nreq`;
    }

    await api.writeTextFile(targetPath, serializeRequestFile(tab.request));

    set({
      tabs: get().tabs.map((t) =>
        t.path === path
          ? { ...t, path: targetPath, title: targetPath.split(/[/\\]/).pop() || t.title, dirty: false }
          : t
      ),
      activeTabPath: targetPath,
    });

    await get().refreshTree();
  },

  sendTabRequest: async (path) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    set({ tabs: get().tabs.map((t) => (t.path === path ? { ...t, sending: true } : t)) });

    const { environments, activeEnvPath, globalVars } = get();
    const envVars = environments.find((e) => e.path === activeEnvPath)?.env.vars ?? [];
    let collectionVarsList: KeyValue[] = [];
    if (!path.startsWith("draft:")) {
      try {
        collectionVarsList = await api.collectionVars(path);
      } catch {
        collectionVarsList = [];
      }
    }
    // precedence (low -> high): global, environment, collection, local
    const merged: KeyValue[] = [...globalVars, ...envVars, ...collectionVarsList, ...tab.request.localVars];

    const response = await api.sendRequest(tab.request, merged, globalVars, collectionVarsList);
    set({
      tabs: get().tabs.map((t) => {
        if (t.path === path) {
          const newHistory = [...t.responseHistory, response].slice(-20); // Keep last 20 responses
          return { ...t, sending: false, response, responseHistory: newHistory };
        }
        return t;
      }),
    });
  },

  createFolder: async (parentPath, name) => {
    const safe = name.trim().replace(/[\\/:*?"<>|]/g, "_");
    await api.createDirectory(`${parentPath}/${safe}`);
    await get().refreshTree();
  },

  createRequest: async (parentPath, name, method = "GET") => {
    const safe = name.trim().replace(/[\\/:*?"<>|]/g, "_") || "Untitled Request";
    const req = emptyRequest(name.trim() || "Untitled Request");
    req.method = method;
    const path = `${parentPath}/${safe}.nreq`;
    await api.writeTextFile(path, serializeRequestFile(req));
    await get().refreshTree();
    await get().openRequestFile(path);
  },

  deleteNode: async (path) => {
    await api.deletePath(path);
    get().closeTab(path);
    await get().refreshTree();
  },

  renameNode: async (path, newName) => {
    const isRequest = path.endsWith(".nreq");
    const safe = newName.trim().replace(/[\\/:*?"<>|]/g, "_");
    const dir = path.slice(0, path.lastIndexOf("/"));
    const newPath = isRequest ? `${dir}/${safe}.nreq` : `${dir}/${safe}`;
    await api.renamePath(path, newPath);
    set({
      tabs: get().tabs.map((t) => (t.path === path ? { ...t, path: newPath, title: safe } : t)),
      activeTabPath: get().activeTabPath === path ? newPath : get().activeTabPath,
    });
    await get().refreshTree();
  },

  loadEnvironments: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;

    // Recursively collect every .nenv file in the workspace, excluding
    // `vars.nenv` (collection-scoped variables, not selectable environments).
    // This ensures environments imported into collection subfolders are found.
    let envFiles: FsNode[] = [];
    try {
      const tree = await api.listTree(workspaceRoot);
      const walk = (nodes: FsNode[]) => {
        for (const n of nodes) {
          if (n.is_dir) {
            if (n.children) walk(n.children);
          } else if (n.name.endsWith(".nenv") && n.name !== "vars.nenv") {
            envFiles.push(n);
          }
        }
      };
      walk(tree);
    } catch {
      envFiles = [];
    }

    const loaded = await Promise.all(
      envFiles.map(async (f) => {
        const content = await api.readTextFile(f.path);
        const env = parseEnvFile(content, f.name.replace(/\.nenv$/, ""));
        env.name = f.name.replace(/\.nenv$/, "");
        return { path: f.path, env };
      })
    );
    set({ environments: loaded });
    if (!get().activeEnvPath && loaded.length) set({ activeEnvPath: loaded[0].path });

    // global variables (always available, no activation needed)
    try {
      const gpath = `${workspaceRoot}/environments/globals.nenv`;
      await api.createDirectory(`${workspaceRoot}/environments`);
      let gcontent: string;
      try {
        gcontent = await api.readTextFile(gpath);
      } catch {
        gcontent = serializeEnvFile({ name: "globals", vars: [] });
        await api.writeTextFile(gpath, gcontent);
      }
      const genv = parseEnvFile(gcontent, "globals");
      set({ globalVars: genv.vars });
    } catch {
      set({ globalVars: [] });
    }
  },

  setActiveEnv: (path) => set({ activeEnvPath: path }),

  createEnvironment: async (name) => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;
    const safe = name.trim().replace(/[\\/:*?"<>|]/g, "_") || "Environment";
    const path = `${workspaceRoot}/environments/${safe}.nenv`;
    await api.writeTextFile(path, serializeEnvFile({ name: safe, vars: [] }));
    await get().loadEnvironments();
    set({ activeEnvPath: path });
  },

  updateEnvironment: async (path, env) => {
    await api.writeTextFile(path, serializeEnvFile(env));
    set({
      environments: get().environments.map((e) => (e.path === path ? { path, env } : e)),
    });
  },

  importPostman: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;
    const name = await importPostmanCollection(workspaceRoot);
    if (name) {
      await get().refreshTree();
      await get().loadEnvironments();
    }
  },

  importBruno: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;
    const name = await importBrunoCollection(workspaceRoot);
    if (name) {
      await get().refreshTree();
      await get().loadEnvironments();
    }
  },

  exportPostman: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) return;
    await exportPostmanCollection(workspaceRoot);
  },

  prompt: (message, title = "Nimbus", defaultValue = "") => {
    return new Promise<string | null>((resolve) => {
      set({ promptState: { open: true, message, title, defaultValue, resolve } });
    });
  },

  resolvePrompt: (value) => {
    const { promptState } = get();
    promptState.resolve?.(value);
    set({ promptState: { open: false, message: "", title: "", defaultValue: "", resolve: null } });
  },
}));
