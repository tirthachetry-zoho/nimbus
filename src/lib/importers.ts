import * as api from "./tauriApi";
import {
  emptyRequest,
  parseEnvFile,
  parseRequestFile,
  serializeEnvFile,
  serializeRequestFile,
} from "./bruFormat";
import { BodyType, FsNode, HttpMethod, KeyValue, NimbusRequest } from "./types";

function sanitize(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|\s]+/g, "_") || "Untitled";
}

function kv(key: string, value: string, enabled = true): KeyValue {
  return { id: Math.random().toString(36).slice(2, 10), key, value, enabled };
}

// ---------------------------------------------------------------------------
// Postman v2.1 import
// ---------------------------------------------------------------------------

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: any;
  variable?: { key: string; value: any }[];
}

function postmanBodyToNimbus(body: any): { bodyType: BodyType; body: string } {
  if (!body) return { bodyType: "none", body: "" };
  const mode = body.mode;
  if (mode === "raw") {
    const raw: string = body.raw ?? "";
    const opts = body.options?.raw?.language;
    let bt: BodyType = "text";
    if (opts === "json") bt = "json";
    else if (opts === "xml") bt = "xml";
    else if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) bt = "json";
    return { bodyType: bt, body: raw };
  }
  if (mode === "urlencoded" || mode === "formdata") {
    const rows: string[] = (body.urlencoded ?? body.formdata ?? [])
      .filter((r: any) => !r.disabled)
      .map((r: any) => `${r.key}: ${r.value ?? ""}`);
    return { bodyType: "form", body: rows.join("\n") };
  }
  return { bodyType: "none", body: "" };
}

function postmanRequestToNimbus(item: PostmanItem): NimbusRequest {
  const req = emptyRequest(item.name || "Untitled Request");
  const r = item.request ?? {};
  req.method = (r.method || "GET").toUpperCase() as HttpMethod;

  if (typeof r.url === "string") {
    req.url = r.url;
  } else if (r.url) {
    req.url = r.url.raw || "";
    if (r.url.query) {
      req.params = r.url.query
        .filter((q: any) => !q.disabled)
        .map((q: any) => kv(q.key, q.value ?? ""));
    }
  }

  if (Array.isArray(r.header)) {
    req.headers = r.header
      .filter((h: any) => !h.disabled && h.key)
      .map((h: any) => kv(h.key, h.value ?? ""));
  }

  const { bodyType, body } = postmanBodyToNimbus(r.body);
  req.bodyType = bodyType;
  req.body = body;

  if (r.auth) {
    const mode = r.auth.type;
    if (mode === "bearer") {
      req.auth = { mode: "bearer", token: r.auth.bearer?.token ?? "" };
    } else if (mode === "basic") {
      req.auth = {
        mode: "basic",
        username: r.auth.basic?.username ?? "",
        password: r.auth.basic?.password ?? "",
      };
    }
  }

  return req;
}

async function writePostmanItem(item: PostmanItem, dir: string): Promise<void> {
  if (item.item && Array.isArray(item.item)) {
    const folder = `${dir}/${sanitize(item.name || "Folder")}`;
    await api.createDirectory(folder);
    for (const child of item.item) await writePostmanItem(child, folder);
  } else if (item.request) {
    const req = postmanRequestToNimbus(item);
    const path = `${dir}/${sanitize(req.name)}.nreq`;
    await api.writeTextFile(path, serializeRequestFile(req));
  }
}

export async function importPostmanCollection(workspaceRoot: string): Promise<string | null> {
  const file = await api.pickFile(["json"]);
  if (!file) return null;
  const content = await api.readTextFile(file);
  const data = JSON.parse(content) as PostmanItem & { info?: { name?: string } };

  const rootName = sanitize(data.info?.name || "Imported Collection");
  const rootDir = `${workspaceRoot}/${rootName}`;
  await api.createDirectory(rootDir);

  // collection-level variables -> environment file
  if (Array.isArray(data.variable) && data.variable.length) {
    const env = {
      name: rootName,
      vars: data.variable.filter((v) => v.key).map((v) => kv(v.key, String(v.value ?? ""))),
    };
    await api.writeTextFile(`${rootDir}/${rootName}.nenv`, serializeEnvFile(env));
  }

  for (const child of data.item ?? []) await writePostmanItem(child, rootDir);
  return rootName;
}

// ---------------------------------------------------------------------------
// Bruno import (folder of .bru files)
// ---------------------------------------------------------------------------

async function importBrunoDir(srcDir: string, destDir: string): Promise<void> {
  const nodes = await api.listTree(srcDir);
  await api.createDirectory(destDir);
  for (const n of nodes) {
    if (n.name === "collection.bru") {
      // collection-level vars -> vars.nenv
      const content = await api.readTextFile(n.path);
      const parsed = parseEnvFile(content, "collection");
      if (parsed.vars.length) {
        await api.writeTextFile(`${destDir}/vars.nenv`, serializeEnvFile(parsed));
      }
      continue;
    }
    if (n.is_dir) {
      await importBrunoDir(n.path, `${destDir}/${sanitize(n.name)}`);
    } else if (n.name.endsWith(".bru")) {
      const content = await api.readTextFile(n.path);
      const req = parseRequestFile(content);
      const name = n.name.replace(/\.bru$/, "");
      await api.writeTextFile(`${destDir}/${sanitize(name)}.nreq`, serializeRequestFile(req));
    } else if (n.name.endsWith(".nenv")) {
      const content = await api.readTextFile(n.path);
      await api.writeTextFile(`${destDir}/${n.name}`, content);
    }
  }
}

export async function importBrunoCollection(workspaceRoot: string): Promise<string | null> {
  const dir = await api.pickFolder();
  if (!dir) return null;
  const rootName = sanitize(dir.split(/[/\\]/).pop() || "Imported Bruno");
  const rootDir = `${workspaceRoot}/${rootName}`;
  await importBrunoDir(dir, rootDir);
  return rootName;
}

// ---------------------------------------------------------------------------
// Postman v2.1 export
// ---------------------------------------------------------------------------

function nimbusToPostmanBody(req: NimbusRequest): any {
  if (req.bodyType === "none" || !req.body.trim()) return undefined;
  if (req.bodyType === "form") {
    const rows = req.body.split("\n").map((l) => {
      const idx = l.indexOf(":");
      return { key: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim(), disabled: false };
    });
    return { mode: "urlencoded", urlencoded: rows };
  }
  const language = req.bodyType === "json" ? "json" : req.bodyType === "xml" ? "xml" : "text";
  return { mode: "raw", raw: req.body, options: { raw: { language } } };
}

function nimbusToPostmanItem(node: FsNode): any {
  if (node.is_dir) {
    const items = (node.children ?? []).map(nimbusToPostmanItem);
    return { name: node.name, item: items };
  }
  // request file
  return null; // handled separately by reading file content
}

async function nodeToPostmanItem(path: string, name: string): Promise<any> {
  const content = await api.readTextFile(path);
  const req = parseRequestFile(content);
  const headers = req.headers
    .filter((h) => h.enabled && h.key)
    .map((h) => ({ key: h.key, value: h.value, disabled: false }));
  const query = req.params
    .filter((p) => p.enabled && p.key)
    .map((p) => ({ key: p.key, value: p.value, disabled: false }));

  const auth: any = {};
  if (req.auth.mode === "bearer") {
    auth.type = "bearer";
    auth.bearer = { token: req.auth.token ?? "" };
  } else if (req.auth.mode === "basic") {
    auth.type = "basic";
    auth.basic = { username: req.auth.username ?? "", password: req.auth.password ?? "" };
  }

  return {
    name: req.name || name.replace(/\.nreq$/, ""),
    request: {
      method: req.method,
      header: headers,
      url: query.length ? { raw: req.url, query } : req.url,
      body: nimbusToPostmanBody(req),
      auth: req.auth.mode === "none" ? undefined : auth,
    },
  };
}

async function buildPostmanItems(dir: string): Promise<any[]> {
  const nodes = await api.listTree(dir);
  const items: any[] = [];
  for (const n of nodes) {
    if (n.name === "vars.nenv" || n.name.endsWith(".nenv")) continue;
    if (n.is_dir) {
      const childItems = await buildPostmanItems(n.path);
      items.push({ name: n.name, item: childItems });
    } else if (n.name.endsWith(".nreq")) {
      items.push(await nodeToPostmanItem(n.path, n.name));
    }
  }
  return items;
}

export async function exportPostmanCollection(workspaceRoot: string): Promise<string | null> {
  const savePath = await api.pickSavePath("nimbus-collection.postman_collection.json", ["json"]);
  if (!savePath) return null;

  const rootName = workspaceRoot.split(/[/\\]/).pop() || "Nimbus Collection";
  const items = await buildPostmanItems(workspaceRoot);

  // root collection vars (if present)
  let variables: { key: string; value: string }[] = [];
  try {
    const vcontent = await api.readTextFile(`${workspaceRoot}/vars.nenv`);
    const env = parseEnvFile(vcontent, "vars");
    variables = env.vars.filter((v) => v.enabled && v.key).map((v) => ({ key: v.key, value: v.value }));
  } catch {
    variables = [];
  }

  const collection = {
    info: {
      name: rootName,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: variables,
    item: items,
  };

  await api.writeTextFile(savePath, JSON.stringify(collection, null, 2));
  return savePath;
}