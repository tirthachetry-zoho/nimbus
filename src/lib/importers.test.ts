import { describe, it, expect, vi, beforeEach } from "vitest";

const api = {
  pickFile: vi.fn(),
  pickFolder: vi.fn(),
  pickSavePath: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  createDirectory: vi.fn(),
  listTree: vi.fn(),
};

vi.mock("./tauriApi", () => ({
  pickFile: (...a: any[]) => api.pickFile(...a),
  pickFolder: (...a: any[]) => api.pickFolder(...a),
  pickSavePath: (...a: any[]) => api.pickSavePath(...a),
  readTextFile: (...a: any[]) => api.readTextFile(...a),
  writeTextFile: (...a: any[]) => api.writeTextFile(...a),
  createDirectory: (...a: any[]) => api.createDirectory(...a),
  listTree: (...a: any[]) => api.listTree(...a),
}));

import {
  importPostmanCollection,
  importBrunoCollection,
  exportPostmanCollection,
} from "./importers";

beforeEach(() => {
  vi.clearAllMocks();
  api.createDirectory.mockResolvedValue(undefined);
  api.writeTextFile.mockResolvedValue(undefined);
});

describe("importPostmanCollection", () => {
  it("returns null when the user cancels file picking", async () => {
    api.pickFile.mockResolvedValue(null);
    expect(await importPostmanCollection("/ws")).toBeNull();
  });

  it("creates requests, folders and an environment from a v2.1 collection", async () => {
    api.pickFile.mockResolvedValue("/tmp/coll.json");
    api.readTextFile.mockResolvedValue(
      JSON.stringify({
        info: { name: "My API" },
        variable: [{ key: "baseUrl", value: "https://api.example.com" }],
        item: [
          {
            name: "Users",
            item: [
              {
                name: "List Users",
                request: {
                  method: "GET",
                  url: { raw: "{{baseUrl}}/users", query: [{ key: "page", value: "1" }] },
                  header: [{ key: "Accept", value: "application/json" }],
                },
              },
              {
                name: "Create",
                request: {
                  method: "POST",
                  url: "{{baseUrl}}/users",
                  body: { mode: "raw", raw: '{"name":"x"}', options: { raw: { language: "json" } } },
                  auth: { type: "bearer", bearer: { token: "t" } },
                },
              },
              {
                name: "Basic Auth",
                request: {
                  method: "GET",
                  url: "x",
                  auth: { type: "basic", basic: { username: "u", password: "p" } },
                },
              },
              {
                name: "Form",
                request: {
                  method: "POST",
                  url: "x",
                  body: { mode: "urlencoded", urlencoded: [{ key: "a", value: "1" }] },
                },
              },
            ],
          },
        ],
      })
    );

    const name = await importPostmanCollection("/ws");
    expect(name).toBe("My_API");

    // root dir + Users folder created
    expect(api.createDirectory).toHaveBeenCalledWith("/ws/My_API");
    expect(api.createDirectory).toHaveBeenCalledWith("/ws/My_API/Users");

    // environment file written from collection variables
    const envCall = api.writeTextFile.mock.calls.find((c) => c[0].endsWith(".nenv"));
    expect(envCall).toBeTruthy();
    expect(envCall![1]).toContain("baseUrl: https://api.example.com");

    // request files written
    const reqCalls = api.writeTextFile.mock.calls.filter((c) => c[0].endsWith(".nreq"));
    expect(reqCalls.length).toBe(4);
    const listUsers = reqCalls.find((c) => c[0].includes("List_Users"))!;
    expect(listUsers[1]).toContain("get {");
    expect(listUsers[1]).toContain("url: {{baseUrl}}/users");
    expect(listUsers[1]).toContain("page: 1");

    const create = reqCalls.find((c) => c[0].includes("Create"))!;
    expect(create[1]).toContain("auth:bearer {");
    expect(create[1]).toContain('{"name":"x"}');

    const basic = reqCalls.find((c) => c[0].includes("Basic_Auth"))!;
    expect(basic[1]).toContain("auth:basic {");

    const form = reqCalls.find((c) => c[0].includes("Form"))!;
    expect(form[1]).toContain("body:form {");
    expect(form[1]).toContain("a: 1");
  });
});

describe("importBrunoCollection", () => {
  it("returns null when the user cancels folder picking", async () => {
    api.pickFolder.mockResolvedValue(null);
    expect(await importBrunoCollection("/ws")).toBeNull();
  });

  it("converts .bru requests and collection vars into .nreq/.nenv", async () => {
    api.pickFolder.mockResolvedValue("/tmp/bruno");
    api.listTree.mockImplementation(async (dir: string) => {
      if (dir === "/tmp/bruno") {
        return [
          { name: "collection.bru", path: "/tmp/bruno/collection.bru", is_dir: false },
          { name: "Get User.bru", path: "/tmp/bruno/Get User.bru", is_dir: false },
          { name: "Sub", path: "/tmp/bruno/Sub", is_dir: true },
        ];
      }
      if (dir === "/tmp/bruno/Sub") {
        return [{ name: "Nested.bru", path: "/tmp/bruno/Sub/Nested.bru", is_dir: false }];
      }
      return [];
    });
    api.readTextFile.mockImplementation(async (p: string) => {
      if (p.endsWith("collection.bru")) return "vars {\n  baseUrl: https://api\n}";
      if (p.endsWith("Get User.bru"))
        return "get {\n  url: {{baseUrl}}/user\n}\nheaders {\n  Accept: application/json\n}";
      if (p.endsWith("Nested.bru")) return "post {\n  url: x\n}";
      return "";
    });

    const name = await importBrunoCollection("/ws");
    expect(name).toBe("bruno");

    // collection vars -> vars.nenv
    const varsCall = api.writeTextFile.mock.calls.find((c) => c[0].endsWith("vars.nenv"));
    expect(varsCall).toBeTruthy();
    expect(varsCall![1]).toContain("baseUrl: https://api");

    // .nreq files created (top-level + nested)
    const nreq = api.writeTextFile.mock.calls.filter((c) => c[0].endsWith(".nreq"));
    expect(nreq.length).toBe(2);
    const get = nreq.find((c) => c[0].includes("Get_User"))!;
    expect(get[1]).toContain("url: {{baseUrl}}/user");
    const nested = nreq.find((c) => c[0].includes("Nested"))!;
    expect(nested[0]).toContain("/ws/bruno/Sub/Nested.nreq");
  });
});

describe("exportPostmanCollection", () => {
  it("returns null when the user cancels save picking", async () => {
    api.pickSavePath.mockResolvedValue(null);
    expect(await exportPostmanCollection("/ws")).toBeNull();
  });

  it("writes a Postman v2.1 collection built from the workspace tree", async () => {
    api.pickSavePath.mockResolvedValue("/tmp/out.postman_collection.json");
    api.listTree.mockImplementation(async (dir: string) => {
      if (dir === "/ws") {
        return [
          {
            name: "Folder",
            path: "/ws/Folder",
            is_dir: true,
            children: [
              { name: "Ping.nreq", path: "/ws/Folder/Ping.nreq", is_dir: false },
              { name: "vars.nenv", path: "/ws/Folder/vars.nenv", is_dir: false },
            ],
          },
          { name: "Root.nreq", path: "/ws/Root.nreq", is_dir: false },
        ];
      }
      if (dir === "/ws/Folder") {
        return [
          { name: "Ping.nreq", path: "/ws/Folder/Ping.nreq", is_dir: false },
          { name: "vars.nenv", path: "/ws/Folder/vars.nenv", is_dir: false },
        ];
      }
      return [];
    });
    api.readTextFile.mockImplementation(async (p: string) => {
      if (p.endsWith("Ping.nreq")) return "get {\n  url: https://x/ping\n}";
      if (p.endsWith("Root.nreq")) return "meta {\n  name: Root\n}\npost {\n  url: https://x\n}\nbody:json {\n  {}\n}";
      if (p.endsWith("vars.nenv")) return "vars {\n  token: abc\n}";
      return "";
    });

    const path = await exportPostmanCollection("/ws");
    expect(path).toBe("/tmp/out.postman_collection.json");

    const write = api.writeTextFile.mock.calls[0];
    const collection = JSON.parse(write[1]);
    expect(collection.info.name).toBe("ws");
    expect(collection.variable).toEqual([{ key: "token", value: "abc" }]);
    // Folder item + Root item
    expect(collection.item.length).toBe(2);
    const folder = collection.item.find((i: any) => i.name === "Folder");
    expect(folder.item[0].request.method).toBe("GET");
    expect(folder.item[0].request.url).toBe("https://x/ping");
    const root = collection.item.find((i: any) => i.name === "Root");
    expect(root.request.method).toBe("POST");
    expect(root.request.body.mode).toBe("raw");
  });
});