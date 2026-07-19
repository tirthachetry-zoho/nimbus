// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../lib/tauriApi");
vi.mock("../lib/importers");

import * as api from "../lib/tauriApi";
import { useStore } from "../lib/store";
import CollectionTree from "./CollectionTree";

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
  (api.confirmAction as any).mockResolvedValue(true);
  (api.readTextFile as any).mockResolvedValue("get { url: x }");
});

// The action buttons (new request/folder, rename, delete) only render once the row is hovered.
function hoverRow(label: string) {
  fireEvent.mouseEnter(screen.getByText(label).parentElement as HTMLElement);
}

describe("CollectionTree", () => {
  it("renders request names without the .nreq extension", () => {
    render(
      <CollectionTree
        nodes={[{ name: "Ping.nreq", path: "/ws/Ping.nreq", is_dir: false, children: null, method: "GET" }]}
      />
    );
    expect(screen.getByText("Ping")).toBeInTheDocument();
    expect(screen.queryByText("Ping.nreq")).not.toBeInTheDocument();
  });

  it("renders a compact method badge for request files", () => {
    render(
      <CollectionTree
        nodes={[{ name: "Create.nreq", path: "/ws/Create.nreq", is_dir: false, children: null, method: "POST" }]}
      />
    );
    // compact badge truncates the method to its first 3 characters
    expect(screen.getByText("POS")).toBeInTheDocument();
  });

  it("opens a request file when a leaf node is clicked", async () => {
    render(
      <CollectionTree
        nodes={[{ name: "Ping.nreq", path: "/ws/Ping.nreq", is_dir: false, children: null, method: "GET" }]}
      />
    );
    fireEvent.click(screen.getByText("Ping"));
    await waitFor(() => expect(useStore.getState().activeTabPath).toBe("/ws/Ping.nreq"));
    expect(useStore.getState().tabs).toHaveLength(1);
  });

  it("renders folders expanded at the root and toggles their expansion", () => {
    render(
      <CollectionTree
        nodes={[
          {
            name: "Sub",
            path: "/ws/Sub",
            is_dir: true,
            children: [{ name: "Inner.nreq", path: "/ws/Sub/Inner.nreq", is_dir: false, children: null, method: "GET" }],
            method: null,
          },
        ]}
      />
    );
    expect(screen.getByText("Sub")).toBeInTheDocument();
    // root-level folders start expanded (depth < 1)
    expect(screen.getByText("Inner")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sub"));
    expect(screen.queryByText("Inner")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Sub"));
    expect(screen.getByText("Inner")).toBeInTheDocument();
  });

  it("prompts for a name when creating a request inside a folder", () => {
    render(
      <CollectionTree
        nodes={[{ name: "Sub", path: "/ws/Sub", is_dir: true, children: [], method: null }]}
      />
    );
    hoverRow("Sub");
    fireEvent.click(screen.getByTitle("New request"));
    expect(useStore.getState().promptState.open).toBe(true);
    expect(useStore.getState().promptState.message).toBe("Request name");
  });

  it("prompts for a name when creating a folder", () => {
    render(
      <CollectionTree
        nodes={[{ name: "Sub", path: "/ws/Sub", is_dir: true, children: [], method: null }]}
      />
    );
    hoverRow("Sub");
    fireEvent.click(screen.getByTitle("New folder"));
    expect(useStore.getState().promptState.open).toBe(true);
    expect(useStore.getState().promptState.message).toBe("Folder name");
  });

  it("deletes a request after confirmation", async () => {
    render(
      <CollectionTree
        nodes={[{ name: "Ping.nreq", path: "/ws/Ping.nreq", is_dir: false, children: null, method: "GET" }]}
      />
    );
    hoverRow("Ping");
    fireEvent.click(screen.getByTitle("Delete"));
    await waitFor(() => expect(api.confirmAction).toHaveBeenCalledWith('Delete "Ping.nreq"?'));
  });
});