import { describe, it, expect, vi, beforeEach } from "vitest";

const api = {
  listTree: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  createDirectory: vi.fn(),
  renamePath: vi.fn(),
  deletePath: vi.fn(),
  collectionVars: vi.fn(),
  pickFolder: vi.fn(),
  pickFile: vi.fn(),
  pickSavePath: vi.fn(),
  confirmAction: vi.fn(),
  interpolate: vi.fn(),
  sendRequest: vi.fn(),
};

const importers = {
  importPostmanCollection: vi.fn(),
  importBrunoCollection: vi.fn(),
  exportPostmanCollection: vi.fn(),
};

vi.mock("./tauriApi", () => ({
  listTree: (...a: any[]) => api.listTree(...a),
  readTextFile: (...a: any[]) => api.readTextFile(...a),
  writeTextFile: (...a: any[]) => api.writeTextFile(...a),
  createDirectory: (...a: any[]) => api.createDirectory(...a),
  renamePath: (...a: any[]) => api.renamePath(...a),
  deletePath: (...a: any[]) => api.deletePath(...a),
  collectionVars: (...a: any[]) => api.collectionVars(...a),
  pickFolder: (...a: any[]) => api.pickFolder(...a),
  pickFile: (...a: any[]) => api.pickFile(...a),
  pickSavePath: (...a: any[]) => api.pickSavePath(...a),
  confirmAction: (...a: any[]) => api.confirmAction(...a),
  interpolate: (...a: any[]) => api.interpolate(...a),
  sendRequest: (...a: any[]) => api.sendRequest(...a),
}));
vi.mock("./importers", () => ({
  importPostmanCollection: (...a: any[]) => importers.importPostmanCollection(...a),
  importBrunoCollection: (...a: any[]) => importers.importBrunoCollection(...a),
  exportPostmanCollection: (...a: any[]) => importers.exportPostmanCollection(...a),
}));

import { useStore } from "./store";
import { emptyRequest } from "./bruFormat";

const reset = () =>
  useStore.setState({
    workspaceRoot: null,
    tree: [],
    loadingTree: false,
    tabs: [],
    activeTabPath: null,
    environments: [],
    activeEnvPath: null,
    globalVars: [],
    promptState: { open: false, message: "", title: "", defaultValue: "", resolve: null },
  });

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  api.listTree.mockResolvedValue([]);
  api.readTextFile.mockResolvedValue("vars {\n  k: v\n}");
  api.writeTextFile.mockResolvedValue(undefined);
  api.createDirectory.mockResolvedValue(undefined);
  api.renamePath.mockResolvedValue(undefined);
  api.deletePath.mockResolvedValue(undefined);
  api.collectionVars.mockResolvedValue([]);
  api.sendRequest.mockResolvedValue({
    status: 200,
    status_text: "OK",
    headers: {},
    body: "{}",
    duration_ms: 1,
    size_bytes: 2,
  });
});

describe("workspace + tree", () => {
  it("openWorkspace sets root and loads tree + environments", async () => {
    api.listTree.mockResolvedValueOnce([{ name: "A.nreq", path: "/ws/A.nreq", is_dir: false }]);
    await useStore.getState().openWorkspace("/ws");
    expect(useStore.getState().workspaceRoot).toBe("/ws");
    expect(useStore.getState().tree).toEqual([{ name: "A.nreq", path: "/ws/A.nreq", is_dir: false }]);
  });

  it("refreshTree populates the tree", async () => {
    api.listTree.mockResolvedValue([{ name: "x", path: "/ws/x", is_dir: true, children: [] }]);
    useStore.setState({ workspaceRoot: "/ws" });
    await useStore.getState().refreshTree();
    expect(useStore.getState().tree[0].name).toBe("x");
  });

  it("refreshTree is a no-op without a workspace", async () => {
    await useStore.getState().refreshTree();
    expect(api.listTree).not.toHaveBeenCalled();
  });
});

describe("tabs", () => {
  it("openRequestFile adds a new tab and parses the request", async () => {
    api.readTextFile.mockResolvedValue("meta {\n  name: Ping\n}\nget {\n  url: https://x\n}");
    await useStore.getState().openRequestFile("/ws/Ping.nreq");
    const tabs = useStore.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].title).toBe("Ping.nreq");
    expect(tabs[0].request.url).toBe("https://x");
    expect(useStore.getState().activeTabPath).toBe("/ws/Ping.nreq");
  });

  it("openRequestFile focuses an existing tab instead of duplicating", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    await useStore.getState().openRequestFile("/ws/B.nreq");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    expect(useStore.getState().tabs).toHaveLength(2);
    expect(useStore.getState().activeTabPath).toBe("/ws/A.nreq");
  });

  it("newRequestDraft creates an unsaved draft tab", () => {
    const before = useStore.getState().tabs.length;
    useStore.getState().newRequestDraft("/ws");
    const tabs = useStore.getState().tabs;
    expect(tabs.length).toBe(before + 1);
    expect(tabs[tabs.length - 1].path.startsWith("draft:")).toBe(true);
    expect(tabs[tabs.length - 1].dirty).toBe(true);
  });

  it("closeTab removes a tab and selects the previous one", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    await useStore.getState().openRequestFile("/ws/B.nreq");
    useStore.getState().closeTab("/ws/B.nreq");
    expect(useStore.getState().tabs.map((t) => t.path)).toEqual(["/ws/A.nreq"]);
    expect(useStore.getState().activeTabPath).toBe("/ws/A.nreq");
  });

  it("setActiveTab switches the active tab", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    await useStore.getState().openRequestFile("/ws/B.nreq");
    useStore.getState().setActiveTab("/ws/A.nreq");
    expect(useStore.getState().activeTabPath).toBe("/ws/A.nreq");
  });

  it("updateActiveRequest patches the active request and marks dirty", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    useStore.getState().updateActiveRequest({ url: "https://changed" });
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/A.nreq")!;
    expect(tab.request.url).toBe("https://changed");
    expect(tab.dirty).toBe(true);
  });
});

describe("saveTab", () => {
  it("writes a draft to disk and updates its path", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    useStore.getState().newRequestDraft("/ws/Sub");
    const draftPath = useStore.getState().activeTabPath!;
    useStore.getState().updateActiveRequest({ name: "My Req" });
    await useStore.getState().saveTab(draftPath);
    expect(api.writeTextFile).toHaveBeenCalledWith("/ws/Sub/My Req.nreq", expect.stringContaining("meta {"));
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/Sub/My Req.nreq")!;
    expect(tab.dirty).toBe(false);
    expect(useStore.getState().activeTabPath).toBe("/ws/Sub/My Req.nreq");
  });

  it("saves an existing request in place", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    useStore.getState().updateActiveRequest({ url: "https://y" });
    await useStore.getState().saveTab("/ws/A.nreq");
    expect(api.writeTextFile).toHaveBeenCalledWith("/ws/A.nreq", expect.stringContaining("https://y"));
  });
});

describe("sendTabRequest", () => {
  it("merges env + local vars and stores the response", async () => {
    useStore.setState({
      workspaceRoot: "/ws",
      environments: [{ path: "/ws/e.nenv", env: { name: "e", vars: [{ id: "1", key: "base", value: "https://api", enabled: true }] } }],
      activeEnvPath: "/ws/e.nenv",
      globalVars: [{ id: "2", key: "g", value: "G", enabled: true }],
    });
    api.readTextFile.mockResolvedValue("get { url: {{base}}/x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    await useStore.getState().sendTabRequest("/ws/A.nreq");
    expect(api.sendRequest).toHaveBeenCalled();
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/A.nreq")!;
    expect(tab.response?.status).toBe(200);
    expect(tab.sending).toBe(false);
  });

  it("skips collectionVars for draft requests", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    useStore.getState().newRequestDraft("/ws");
    const draft = useStore.getState().activeTabPath!;
    await useStore.getState().sendTabRequest(draft);
    expect(api.collectionVars).not.toHaveBeenCalled();
  });
});

describe("fs mutations", () => {
  it("createFolder sanitizes and refreshes", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    await useStore.getState().createFolder("/ws", "My Folder");
    expect(api.createDirectory).toHaveBeenCalledWith("/ws/My Folder");
    expect(api.listTree).toHaveBeenCalled();
  });

  it("createRequest writes a file and opens it", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    await useStore.getState().createRequest("/ws", "New Req", "POST");
    expect(api.writeTextFile).toHaveBeenCalledWith("/ws/New Req.nreq", expect.stringContaining("post {"));
    expect(useStore.getState().activeTabPath).toBe("/ws/New Req.nreq");
  });

  it("deleteNode removes the path, closes its tab and refreshes", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    await useStore.getState().deleteNode("/ws/A.nreq");
    expect(api.deletePath).toHaveBeenCalledWith("/ws/A.nreq");
    expect(useStore.getState().tabs).toHaveLength(0);
  });

  it("renameNode renames and updates open tabs", async () => {
    api.readTextFile.mockResolvedValue("get { url: x }");
    await useStore.getState().openRequestFile("/ws/A.nreq");
    await useStore.getState().renameNode("/ws/A.nreq", "B");
    expect(api.renamePath).toHaveBeenCalledWith("/ws/A.nreq", "/ws/B.nreq");
    expect(useStore.getState().activeTabPath).toBe("/ws/B.nreq");
  });
});

describe("environments", () => {
  it("loadEnvironments discovers .nenv files and globals", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    api.listTree.mockResolvedValue([
      { name: "Sub", path: "/ws/Sub", is_dir: true, children: [{ name: "env.nenv", path: "/ws/Sub/env.nenv", is_dir: false }] },
      { name: "skip.nreq", path: "/ws/skip.nreq", is_dir: false },
    ]);
    await useStore.getState().loadEnvironments();
    const envs = useStore.getState().environments;
    expect(envs).toHaveLength(1);
    expect(envs[0].path).toBe("/ws/Sub/env.nenv");
    expect(useStore.getState().globalVars).toEqual([{ id: expect.any(String), key: "k", value: "v", enabled: true }]);
  });

  it("setActiveEnv selects an environment", () => {
    useStore.setState({ environments: [{ path: "/ws/e.nenv", env: { name: "e", vars: [] } }] });
    useStore.getState().setActiveEnv("/ws/e.nenv");
    expect(useStore.getState().activeEnvPath).toBe("/ws/e.nenv");
  });

  it("createEnvironment writes a file and activates it", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    await useStore.getState().createEnvironment("Dev");
    expect(api.writeTextFile).toHaveBeenCalledWith("/ws/environments/Dev.nenv", expect.stringContaining("vars {"));
    expect(useStore.getState().activeEnvPath).toBe("/ws/environments/Dev.nenv");
  });

  it("updateEnvironment writes and updates state", async () => {
    useStore.setState({
      environments: [{ path: "/ws/e.nenv", env: { name: "e", vars: [{ id: "1", key: "a", value: "b", enabled: true }] } }],
    });
    const env = { name: "e", vars: [{ id: "1", key: "a", value: "c", enabled: true }] };
    await useStore.getState().updateEnvironment("/ws/e.nenv", env);
    expect(api.writeTextFile).toHaveBeenCalledWith("/ws/e.nenv", expect.stringContaining("a: c"));
    expect(useStore.getState().environments[0].env.vars[0].value).toBe("c");
  });
});

describe("import / export", () => {
  it("importPostman delegates and refreshes", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    importers.importPostmanCollection.mockResolvedValue("Coll");
    await useStore.getState().importPostman();
    expect(importers.importPostmanCollection).toHaveBeenCalledWith("/ws");
    expect(api.listTree).toHaveBeenCalled();
  });

  it("importBruno delegates", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    importers.importBrunoCollection.mockResolvedValue("B");
    await useStore.getState().importBruno();
    expect(importers.importBrunoCollection).toHaveBeenCalledWith("/ws");
  });

  it("exportPostman delegates", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    await useStore.getState().exportPostman();
    expect(importers.exportPostmanCollection).toHaveBeenCalledWith("/ws");
  });
});

describe("prompt", () => {
  it("resolves the promise and clears state", async () => {
    const p = useStore.getState().prompt("Name?");
    expect(useStore.getState().promptState.open).toBe(true);
    useStore.getState().resolvePrompt("answer");
    expect(await p).toBe("answer");
    expect(useStore.getState().promptState.open).toBe(false);
    expect(useStore.getState().promptState.resolve).toBeNull();
  });

  it("returns null when cancelled", async () => {
    const p = useStore.getState().prompt("Name?");
    useStore.getState().resolvePrompt(null);
    expect(await p).toBeNull();
  });
});