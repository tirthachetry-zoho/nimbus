// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

vi.mock("../lib/tauriApi");
vi.mock("../lib/importers");

import * as api from "../lib/tauriApi";
import * as importers from "../lib/importers";
import { useStore } from "../lib/store";
import MethodBadge from "./MethodBadge";
import KeyValueEditor from "./KeyValueEditor";
import ResponseViewer from "./ResponseViewer";
import Tabs from "./Tabs";
import Sidebar from "./Sidebar";
import EnvironmentPanel from "./EnvironmentPanel";
import PromptModal from "./PromptModal";

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

const baseRequest = (name: string) => ({
  name,
  method: "GET" as const,
  url: "",
  headers: [],
  params: [],
  bodyType: "none" as const,
  body: "",
  auth: { mode: "none" as const },
  localVars: [],
  tls: { verifySsl: true, caCert: "", clientCert: "", clientKey: "", clientKeyPass: "" },
});

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  (api.listTree as any).mockResolvedValue([]);
  (api.readTextFile as any).mockResolvedValue("get { url: x }");
  (api.sendRequest as any).mockResolvedValue({ status: 200, status_text: "OK", headers: {}, body: "{}", duration_ms: 1, size_bytes: 2 });
});

describe("MethodBadge", () => {
  it("renders the method text", () => {
    const { container } = render(<MethodBadge method="POST" />);
    expect(container.textContent).toBe("POST");
  });

  it("renders GET", () => {
    const { container } = render(<MethodBadge method="GET" />);
    expect(container.textContent).toBe("GET");
  });
});

describe("KeyValueEditor", () => {
  it("renders a row per entry with key/value inputs", () => {
    const rows = [{ id: "1", key: "Accept", value: "application/json", enabled: true }];
    render(<KeyValueEditor items={rows} onChange={() => {}} />);
    expect(screen.getByDisplayValue("Accept")).toBeInTheDocument();
    expect(screen.getByDisplayValue("application/json")).toBeInTheDocument();
  });

  it("calls onChange with an updated row when a value is edited", () => {
    const rows = [{ id: "1", key: "k", value: "v", enabled: true }];
    const onChange = vi.fn();
    render(<KeyValueEditor items={rows} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("v"), { target: { value: "v2" } });
    expect(onChange).toHaveBeenCalledWith([{ id: "1", key: "k", value: "v2", enabled: true }]);
  });

  it("adds a new row via the Add button", () => {
    const onChange = vi.fn();
    render(<KeyValueEditor items={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText("Add"));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ key: "", value: "", enabled: true })]);
  });

  it("disables inputs when the row is not enabled", () => {
    const rows = [{ id: "1", key: "k", value: "v", enabled: false }];
    render(<KeyValueEditor items={rows} onChange={() => {}} />);
    expect(screen.getByDisplayValue("k")).toBeDisabled();
  });
});

describe("ResponseViewer", () => {
  it("prompts to send a request when the active tab has no response", () => {
    useStore.setState({
      tabs: [{ path: "/a.nreq", title: "A", request: baseRequest("A"), response: null, sending: false, dirty: false, responseHistory: [] }],
      activeTabPath: "/a.nreq",
    });
    render(<ResponseViewer />);
    expect(screen.getByText(/Send a request to see the response here/i)).toBeInTheDocument();
  });

  it("renders status, duration and size for a response", () => {
    useStore.setState({
      tabs: [
        {
          path: "/a.nreq",
          title: "A",
          request: baseRequest("A"),
          response: { status: 201, status_text: "Created", headers: {}, body: "{}", duration_ms: 42, size_bytes: 7 },
          sending: false,
          dirty: false,
          responseHistory: [],
        },
      ],
      activeTabPath: "/a.nreq",
    });
    render(<ResponseViewer />);
    expect(screen.getByText("201 Created")).toBeInTheDocument();
    expect(screen.getByText(/42 ms/)).toBeInTheDocument();
    expect(screen.getByText(/7 B/)).toBeInTheDocument();
  });

  it("pretty-prints a JSON body", () => {
    useStore.setState({
      tabs: [
        {
          path: "/a.nreq",
          title: "A",
          request: baseRequest("A"),
          response: { status: 200, status_text: "OK", headers: {}, body: '{"a":1}', duration_ms: 1, size_bytes: 1 },
          sending: false,
          dirty: false,
          responseHistory: [],
        },
      ],
      activeTabPath: "/a.nreq",
    });
    render(<ResponseViewer />);
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("renders open tabs and switches the active one on click", () => {
    useStore.setState({
      tabs: [
        { path: "/a.nreq", title: "A", request: baseRequest("A"), response: null, sending: false, dirty: false, responseHistory: [] },
        { path: "/b.nreq", title: "B", request: baseRequest("B"), response: null, sending: false, dirty: false, responseHistory: [] },
      ],
      activeTabPath: "/a.nreq",
    });
    render(<Tabs />);
    fireEvent.click(screen.getByText("B"));
    expect(useStore.getState().activeTabPath).toBe("/b.nreq");
  });

  it("closes a tab via the close button", () => {
    useStore.setState({
      tabs: [{ path: "/a.nreq", title: "A", request: baseRequest("A"), response: null, sending: false, dirty: false, responseHistory: [] }],
      activeTabPath: "/a.nreq",
    });
    render(<Tabs />);
    fireEvent.click(screen.getByRole("button"));
    expect(useStore.getState().tabs).toHaveLength(0);
  });
});

describe("Sidebar", () => {
  it("shows the Open Workspace button when no workspace is loaded", () => {
    render(<Sidebar onManageEnv={() => {}} />);
    expect(screen.getByText(/Open Workspace/i)).toBeInTheDocument();
  });

  it("opens a workspace when the button is clicked", async () => {
    (api.pickFolder as any).mockResolvedValue("/ws");
    render(<Sidebar onManageEnv={() => {}} />);
    fireEvent.click(screen.getByText(/Open Workspace/i));
    await waitFor(() => expect(useStore.getState().workspaceRoot).toBe("/ws"));
  });

  it("renders the tree and opens a request on click", async () => {
    useStore.setState({
      workspaceRoot: "/ws",
      tree: [{ name: "Ping.nreq", path: "/ws/Ping.nreq", is_dir: false, children: null, method: null }],
    });
    render(<Sidebar onManageEnv={() => {}} />);
    fireEvent.click(screen.getByText("Ping"));
    expect(api.readTextFile).toHaveBeenCalledWith("/ws/Ping.nreq");
  });

  it("wires the import/export buttons", async () => {
    useStore.setState({ workspaceRoot: "/ws" });
    (importers.importPostmanCollection as any).mockResolvedValue("C");
    (importers.importBrunoCollection as any).mockResolvedValue("B");
    (importers.exportPostmanCollection as any).mockResolvedValue("/o");
    render(<Sidebar onManageEnv={() => {}} />);
    // The import dropdown closes after a selection, so re-open it between clicks.
    fireEvent.click(screen.getByText("Import"));
    fireEvent.click(screen.getByText(/Bruno folder/));
    fireEvent.click(screen.getByText("Import"));
    fireEvent.click(screen.getByText(/Postman v2\.1/));
    fireEvent.click(screen.getByText("Export"));
    expect(importers.importPostmanCollection).toHaveBeenCalled();
    expect(importers.importBrunoCollection).toHaveBeenCalled();
    expect(importers.exportPostmanCollection).toHaveBeenCalled();
  });
});

describe("EnvironmentPanel", () => {
  it("lists environments", () => {
    useStore.setState({
      environments: [
        { path: "/ws/a.nenv", env: { name: "Alpha", vars: [] } },
        { path: "/ws/b.nenv", env: { name: "Beta", vars: [] } },
      ],
    });
    render(<EnvironmentPanel onClose={() => {}} />);
    // "Alpha" is the selected env, so it appears both in the list and the header.
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("creates a new environment via the prompt", async () => {
    useStore.setState({ workspaceRoot: "/ws", environments: [] });
    // createEnvironment re-scans the workspace; reflect the newly written file so it
    // shows up in the environment list.
    (api.listTree as any).mockResolvedValue([
      { name: "MyEnv.nenv", path: "/ws/environments/MyEnv.nenv", is_dir: false },
    ]);
    (api.readTextFile as any).mockImplementation(async (p: string) => {
      if (String(p).endsWith("MyEnv.nenv")) return "vars {\n  k: v\n}";
      return "get { url: x }";
    });
    render(
      <>
        <EnvironmentPanel onClose={() => {}} />
        <PromptModal />
      </>
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "MyEnv" } });
    fireEvent.click(screen.getByText("OK"));
    expect(await screen.findByText("MyEnv")).toBeInTheDocument();
    expect(api.writeTextFile).toHaveBeenCalled();
  });
});

describe("PromptModal", () => {
  it("resolves with the typed value on OK", async () => {
    const p = useStore.getState().prompt("Name?");
    render(<PromptModal />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    fireEvent.click(screen.getByText("OK"));
    expect(await p).toBe("hello");
  });

  it("resolves with null on Cancel", async () => {
    const p = useStore.getState().prompt("Name?");
    render(<PromptModal />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(await p).toBeNull();
  });
});