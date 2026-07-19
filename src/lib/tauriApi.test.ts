import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const openMock = vi.fn();
const saveMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: any[]) => openMock(...args),
  save: (...args: any[]) => saveMock(...args),
  confirm: (...args: any[]) => confirmMock(...args),
}));

import * as api from "./tauriApi";
import { emptyRequest } from "./bruFormat";

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  saveMock.mockReset();
  confirmMock.mockReset();
});

describe("interpolate", () => {
  it("substitutes enabled variables", () => {
    expect(api.interpolate("{{baseUrl}}/users", [{ id: "1", key: "baseUrl", value: "https://x", enabled: true }])).toBe(
      "https://x/users"
    );
  });

  it("leaves disabled and missing variables untouched", () => {
    const vars = [
      { id: "1", key: "a", value: "A", enabled: false },
      { id: "2", key: "b", value: "B", enabled: true },
    ];
    expect(api.interpolate("{{a}}-{{b}}-{{c}}", vars)).toBe("{{a}}-B-{{c}}");
  });

  it("replaces every occurrence", () => {
    const vars = [{ id: "1", key: "x", value: "9", enabled: true }];
    expect(api.interpolate("{{x}} and {{x}}", vars)).toBe("9 and 9");
  });
});

describe("dialog wrappers", () => {
  it("pickFolder returns the selected directory", async () => {
    openMock.mockResolvedValue("/some/dir");
    expect(await api.pickFolder()).toBe("/some/dir");
    expect(openMock).toHaveBeenCalledWith({ directory: true, multiple: false });
  });

  it("pickFolder handles array and null results", async () => {
    openMock.mockResolvedValue(["/a", "/b"]);
    expect(await api.pickFolder()).toBe("/a");
    openMock.mockResolvedValue(null);
    expect(await api.pickFolder()).toBeNull();
  });

  it("pickFile passes extensions as filters", async () => {
    openMock.mockResolvedValue("/f.json");
    expect(await api.pickFile(["json"])).toBe("/f.json");
    expect(openMock).toHaveBeenCalledWith({ directory: false, multiple: false, filters: [{ name: "Files", extensions: ["json"] }] });
  });

  it("pickSavePath delegates to save", async () => {
    saveMock.mockResolvedValue("/out.json");
    expect(await api.pickSavePath("x.json", ["json"])).toBe("/out.json");
    expect(saveMock).toHaveBeenCalledWith({ defaultPath: "x.json", filters: [{ name: "Files", extensions: ["json"] }] });
  });

  it("confirmAction delegates to confirm", async () => {
    confirmMock.mockResolvedValue(true);
    expect(await api.confirmAction("sure?", "Title")).toBe(true);
    expect(confirmMock).toHaveBeenCalledWith("sure?", "Title");
  });
});

describe("fs wrappers", () => {
  it("listTree invokes list_tree", async () => {
    invokeMock.mockResolvedValue([{ name: "a" }]);
    await api.listTree("/root");
    expect(invokeMock).toHaveBeenCalledWith("list_tree", { root: "/root" });
  });

  it("readTextFile / writeTextFile / createDirectory delegate", async () => {
    invokeMock.mockResolvedValue("ok");
    await api.readTextFile("/p");
    expect(invokeMock).toHaveBeenCalledWith("read_text_file", { path: "/p" });

    await api.writeTextFile("/p", "data");
    expect(invokeMock).toHaveBeenCalledWith("write_text_file", { path: "/p", contents: "data" });

    await api.createDirectory("/d");
    expect(invokeMock).toHaveBeenCalledWith("create_directory", { path: "/d" });
  });

  it("renamePath / deletePath delegate", async () => {
    await api.renamePath("/a", "/b");
    expect(invokeMock).toHaveBeenCalledWith("rename_path", { from: "/a", to: "/b" });
    await api.deletePath("/a");
    expect(invokeMock).toHaveBeenCalledWith("delete_path", { path: "/a" });
  });

  it("collectionVars maps pairs to KeyValue", async () => {
    invokeMock.mockResolvedValue([["k1", "v1"], ["k2", "v2"]]);
    const vars = await api.collectionVars("/req.nreq");
    expect(vars).toEqual([
      { id: "cv_0", key: "k1", value: "v1", enabled: true },
      { id: "cv_1", key: "k2", value: "v2", enabled: true },
    ]);
  });
});

describe("sendRequest", () => {
  const baseResponse = {
    status: 200,
    status_text: "OK",
    headers: { "content-type": "application/json" },
    body: "{}",
    duration_ms: 12,
    size_bytes: 2,
  };

  beforeEach(() => {
    invokeMock.mockResolvedValue(baseResponse);
  });

  it("sends a basic GET and forwards the payload", async () => {
    const req = emptyRequest("R");
    req.method = "GET";
    req.url = "https://api.example.com/x";
    const resp = await api.sendRequest(req, []);
    expect(resp).toEqual(baseResponse);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.method).toBe("GET");
    expect(payload.payload.url).toBe("https://api.example.com/x");
    expect(payload.payload.timeout_ms).toBe(30000);
  });

  it("injects a bearer Authorization header", async () => {
    const req = emptyRequest("R");
    req.auth = { mode: "bearer", token: "tok" };
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.headers["Authorization"]).toBe("Bearer tok");
  });

  it("injects a basic Authorization header (base64)", async () => {
    const req = emptyRequest("R");
    req.auth = { mode: "basic", username: "u", password: "p" };
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.headers["Authorization"]).toBe("Basic " + btoa("u:p"));
  });

  it("sets Content-Type for json body", async () => {
    const req = emptyRequest("R");
    req.bodyType = "json";
    req.body = "{}";
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.headers["Content-Type"]).toBe("application/json");
    expect(payload.payload.body).toBe("{}");
  });

  it("encodes form body as urlencoded", async () => {
    const req = emptyRequest("R");
    req.bodyType = "form";
    req.body = "a: 1\nb: 2";
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(payload.payload.body).toBe("a=1&b=2");
  });

  it("appends enabled query params to the url", async () => {
    const req = emptyRequest("R");
    req.url = "https://api.example.com/x";
    req.params = [
      { id: "1", key: "q", value: "search", enabled: true },
      { id: "2", key: "off", value: "0", enabled: false },
    ];
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.url).toBe("https://api.example.com/x?q=search");
  });

  it("interpolates url, headers and body with provided vars", async () => {
    const req = emptyRequest("R");
    req.url = "{{base}}/u";
    req.headers = [{ id: "1", key: "X-Token", value: "{{tok}}", enabled: true }];
    req.bodyType = "text";
    req.body = "hi {{name}}";
    await api.sendRequest(req, [
      { id: "1", key: "base", value: "https://api", enabled: true },
      { id: "2", key: "tok", value: "abc", enabled: true },
      { id: "3", key: "name", value: "bob", enabled: true },
    ]);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.url).toBe("https://api/u");
    expect(payload.payload.headers["X-Token"]).toBe("abc");
    expect(payload.payload.body).toBe("hi bob");
  });

  it("returns an error response when invoke rejects", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));
    const resp = await api.sendRequest(emptyRequest("R"), []);
    expect(resp.status).toBe(0);
    expect(resp.status_text).toBe("Error");
    expect(resp.error).toBe("Error: boom");
  });

  it("wraps a graphql body as a JSON query and sets Content-Type", async () => {
    const req = emptyRequest("R");
    req.bodyType = "graphql";
    req.body = "query { user { id } }";
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.headers["Content-Type"]).toBe("application/json");
    expect(payload.payload.body).toBe(JSON.stringify({ query: "query { user { id } }" }));
  });

  it("interpolates the graphql body before wrapping", async () => {
    const req = emptyRequest("R");
    req.bodyType = "graphql";
    req.body = "query { user(id: {{id}}) }";
    await api.sendRequest(req, [{ id: "1", key: "id", value: "42", enabled: true }]);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.body).toBe(JSON.stringify({ query: "query { user(id: 42) }" }));
  });

  it("forwards global and collection vars to the payload", async () => {
    const req = emptyRequest("R");
    const globals = [{ id: "1", key: "g", value: "G", enabled: true }];
    const collections = [{ id: "2", key: "c", value: "C", enabled: true }];
    await api.sendRequest(req, [], globals, collections);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.global_vars).toEqual({ g: "G" });
    expect(payload.payload.collection_vars).toEqual({ c: "C" });
  });

  it("forwards enabled local vars to the payload", async () => {
    const req = emptyRequest("R");
    req.localVars = [
      { id: "1", key: "a", value: "A", enabled: true },
      { id: "2", key: "b", value: "B", enabled: false },
    ];
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.local_vars).toEqual({ a: "A" });
  });

  it("forwards pre-request and post-response scripts when enabled", async () => {
    const req = emptyRequest("R");
    req.preRequestScript = { enabled: true, source: "log('pre')" };
    req.postResponseScript = { enabled: true, source: "log('post')" };
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.pre_request_script).toBe("log('pre')");
    expect(payload.payload.post_response_script).toBe("log('post')");
  });

  it("omits scripts from the payload when disabled", async () => {
    const req = emptyRequest("R");
    req.preRequestScript = { enabled: false, source: "log('pre')" };
    req.postResponseScript = { enabled: false, source: "log('post')" };
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.pre_request_script).toBeNull();
    expect(payload.payload.post_response_script).toBeNull();
  });

  it("forwards test assertions to the payload", async () => {
    const req = emptyRequest("R");
    req.tests = [
      { id: "t1", enabled: true, expression: "response.status === 200", description: "ok" },
      { id: "t2", enabled: false, expression: "false", description: "off" },
    ];
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.tests).toEqual([
      { id: "t1", enabled: true, expression: "response.status === 200", description: "ok" },
      { id: "t2", enabled: false, expression: "false", description: "off" },
    ]);
  });

  it("forwards proxy settings to the payload", async () => {
    const req = emptyRequest("R");
    req.proxySettings = { enabled: true, host: "localhost", port: 8080, username: "u", password: "p" };
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.proxy_enabled).toBe(true);
    expect(payload.payload.proxy_host).toBe("localhost");
    expect(payload.payload.proxy_port).toBe(8080);
    expect(payload.payload.proxy_username).toBe("u");
    expect(payload.payload.proxy_password).toBe("p");
  });

  it("omits proxy settings from the payload when disabled", async () => {
    const req = emptyRequest("R");
    req.proxySettings = { enabled: false, host: "localhost", port: 8080 };
    await api.sendRequest(req, []);
    const [, payload] = invokeMock.mock.calls[0];
    expect(payload.payload.proxy_enabled).toBe(false);
    expect(payload.payload.proxy_host).toBe("localhost");
    expect(payload.payload.proxy_port).toBe(8080);
  });
});
