// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../lib/tauriApi");
vi.mock("../lib/importers");

import * as api from "../lib/tauriApi";
import { useStore } from "../lib/store";
import { NimbusRequest } from "../lib/types";
import RequestBuilder from "./RequestBuilder";

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

const baseRequest: NimbusRequest = {
  name: "Ping",
  method: "GET" as const,
  url: "https://api.example.com/ping",
  headers: [],
  params: [],
  bodyType: "none" as const,
  body: "",
  auth: { mode: "none" as const },
  localVars: [],
  tls: { verifySsl: true, caCert: "", clientCert: "", clientKey: "", clientKeyPass: "" },
};

const openTab = (overrides: Partial<typeof baseRequest> = {}) => {
  const request = { ...baseRequest, ...overrides };
  useStore.setState({
    tabs: [{ path: "/ws/Ping.nreq", title: "Ping", request, response: null, sending: false, dirty: false, responseHistory: [] }],
    activeTabPath: "/ws/Ping.nreq",
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  (api.sendRequest as any).mockResolvedValue({
    status: 200,
    status_text: "OK",
    headers: {},
    body: "{}",
    duration_ms: 1,
    size_bytes: 2,
  });
  (api.collectionVars as any).mockResolvedValue([]);
});

describe("RequestBuilder", () => {
  it("shows a placeholder when no request is active", () => {
    render(<RequestBuilder />);
    expect(screen.getByText(/Select or create a request to get started/i)).toBeInTheDocument();
  });

  it("renders the request name and url", () => {
    openTab();
    render(<RequestBuilder />);
    expect(screen.getByDisplayValue("Ping")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://api.example.com/ping")).toBeInTheDocument();
  });

  it("updates the request name through the store", () => {
    openTab();
    render(<RequestBuilder />);
    fireEvent.change(screen.getByDisplayValue("Ping"), { target: { value: "Pong" } });
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/Ping.nreq")!;
    expect(tab.request.name).toBe("Pong");
    expect(tab.dirty).toBe(true);
  });

  it("updates the url through the store", () => {
    openTab();
    render(<RequestBuilder />);
    fireEvent.change(screen.getByDisplayValue("https://api.example.com/ping"), {
      target: { value: "https://x.test/y" },
    });
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/Ping.nreq")!;
    expect(tab.request.url).toBe("https://x.test/y");
  });

  it("switches sub tabs", () => {
    // give the request a header so the KeyValueEditor renders an input row
    openTab({ headers: [{ id: "1", key: "X", value: "Y", enabled: true }] });
    render(<RequestBuilder />);
    fireEvent.click(screen.getByText(/Headers/));
    expect(screen.getByPlaceholderText("Header-Name")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Body/));
    expect(screen.getByText(/This request has no body/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Auth/));
    expect(screen.getByText("No Auth")).toBeInTheDocument();
  });

  it("selects a body type and shows the body editor", () => {
    openTab();
    const { container } = render(<RequestBuilder />);
    fireEvent.click(screen.getByText(/Body/));
    fireEvent.click(screen.getByLabelText("json"));
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/Ping.nreq")!;
    expect(tab.request.bodyType).toBe("json");
    // the body textarea is rendered once a non-"none" body type is selected
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("selects bearer auth and shows the token field", () => {
    openTab();
    render(<RequestBuilder />);
    fireEvent.click(screen.getByText("Auth"));
    fireEvent.click(screen.getByLabelText("Bearer Token"));
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/Ping.nreq")!;
    expect(tab.request.auth.mode).toBe("bearer");
    expect(screen.getByPlaceholderText("{{token}}")).toBeInTheDocument();
  });

  it("disables Send when the url is empty", () => {
    openTab({ url: "" });
    render(<RequestBuilder />);
    expect(screen.getByText("Send")).toBeDisabled();
  });

  it("enables Send when a url is present and sends the request", async () => {
    openTab();
    render(<RequestBuilder />);
    const send = screen.getByText("Send");
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    await waitFor(() => expect(api.sendRequest).toHaveBeenCalled());
  });

  it("disables Save until the request is dirty", () => {
    openTab();
    render(<RequestBuilder />);
    expect(screen.getByTitle("Save (Ctrl/Cmd+S)")).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue("Ping"), { target: { value: "Ping2" } });
    expect(screen.getByTitle("Save (Ctrl/Cmd+S)")).not.toBeDisabled();
  });

  it("changes the HTTP method via the method dropdown", () => {
    openTab();
    render(<RequestBuilder />);
    fireEvent.click(screen.getByText("GET"));
    fireEvent.click(screen.getByText("POST"));
    const tab = useStore.getState().tabs.find((t) => t.path === "/ws/Ping.nreq")!;
    expect(tab.request.method).toBe("POST");
  });
});