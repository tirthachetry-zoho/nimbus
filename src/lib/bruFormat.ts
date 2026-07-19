import { AuthMode, BodyType, HttpMethod, KeyValue, NimbusEnvironment, NimbusRequest, TlsSettings } from "./types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "QUERY"];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface Block {
  name: string; // e.g. "meta", "get", "headers", "body:json", "auth:bearer"
  lines: string[]; // raw content lines, de-indented
}

/** Splits a .nreq/.nenv file into top-level `name { ... }` blocks, tracking brace depth
 * so nested braces (e.g. inside a JSON body) don't terminate the block early. */
function splitBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(/^([a-zA-Z][a-zA-Z0-9:_-]*)\s*\{\s*$/);
    if (!open) {
      i++;
      continue;
    }
    const name = open[1];
    let depth = 1;
    const content: string[] = [];
    i++;
    while (i < lines.length && depth > 0) {
      const l = lines[i];
      const opens = (l.match(/\{/g) || []).length;
      const closes = (l.match(/\}/g) || []).length;
      depth += opens - closes;
      if (depth === 0) {
        i++;
        break;
      }
      content.push(l.startsWith("  ") ? l.slice(2) : l);
      i++;
    }
    blocks.push({ name, lines: content });
  }

  return blocks;
}

function parseKVLines(lines: string[]): KeyValue[] {
  const out: KeyValue[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let enabled = true;
    let body = line;
    if (body.startsWith("~")) {
      enabled = false;
      body = body.slice(1).trim();
    }
    const idx = body.indexOf(":");
    if (idx === -1) continue;
    const key = body.slice(0, idx).trim();
    const value = body.slice(idx + 1).trim();
    out.push({ id: uid(), key, value, enabled });
  }
  return out;
}

function serializeKVLines(items: KeyValue[]): string {
  return items
    .filter((i) => i.key.trim() !== "")
    .map((i) => `  ${i.enabled ? "" : "~"}${i.key}: ${i.value}`)
    .join("\n");
}

function blockMap(blocks: Block[]): Map<string, Block> {
  const m = new Map<string, Block>();
  for (const b of blocks) m.set(b.name, b);
  return m;
}

function parseSingleKV(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

export function emptyRequest(name = "Untitled Request"): NimbusRequest {
  return {
    name,
    method: "GET",
    url: "",
    headers: [],
    params: [],
    bodyType: "none",
    body: "",
    auth: { mode: "none" },
    localVars: [],
    tls: { verifySsl: true, caCert: "", clientCert: "", clientKey: "", clientKeyPass: "" },
  };
}

export function parseRequestFile(content: string): NimbusRequest {
  const blocks = splitBlocks(content);
  const map = blockMap(blocks);

  const req = emptyRequest();

  const meta = map.get("meta");
  if (meta) {
    const kv = parseSingleKV(meta.lines);
    if (kv.name) req.name = kv.name;
  }

  const methodBlock = blocks.find((b) => METHODS.includes(b.name.toUpperCase() as HttpMethod));
  if (methodBlock) {
    req.method = methodBlock.name.toUpperCase() as HttpMethod;
    const kv = parseSingleKV(methodBlock.lines);
    if (kv.url) req.url = kv.url;
  }

  const headers = map.get("headers");
  if (headers) req.headers = parseKVLines(headers.lines);

  const params = map.get("params") || map.get("params:query");
  if (params) req.params = parseKVLines(params.lines);

  const auth = map.get("auth");
  const authMode = auth ? (parseSingleKV(auth.lines).mode as AuthMode) : "none";
  req.auth = { mode: authMode || "none" };
  if (authMode === "bearer") {
    const b = map.get("auth:bearer");
    if (b) req.auth.token = parseSingleKV(b.lines).token || "";
  } else if (authMode === "basic") {
    const b = map.get("auth:basic");
    if (b) {
      const kv = parseSingleKV(b.lines);
      req.auth.username = kv.username || "";
      req.auth.password = kv.password || "";
    }
  }

  for (const bt of ["json", "text", "xml", "form"] as BodyType[]) {
    const b = map.get(`body:${bt}`);
    if (b) {
      req.bodyType = bt;
      req.body = b.lines.join("\n").replace(/\n+$/, "");
    }
  }

  const docs = map.get("docs");
  if (docs) req.docs = docs.lines.join("\n").replace(/\n+$/, "");

  const local = map.get("vars") || map.get("vars:local");
  if (local) req.localVars = parseKVLines(local.lines);

  const tls = map.get("tls");
  if (tls) {
    const kv = parseSingleKV(tls.lines);
    req.tls = {
      verifySsl: kv.verifySsl === undefined ? true : kv.verifySsl !== "false",
      caCert: kv.caCert || "",
      clientCert: kv.clientCert || "",
      clientKey: kv.clientKey || "",
      clientKeyPass: kv.clientKeyPass || "",
    };
  }

  return req;
}

export function serializeRequestFile(req: NimbusRequest): string {
  const parts: string[] = [];

  parts.push(`meta {\n  name: ${req.name}\n}`);
  parts.push(`${req.method.toLowerCase()} {\n  url: ${req.url}\n}`);

  if (req.params.length) {
    parts.push(`params:query {\n${serializeKVLines(req.params)}\n}`);
  }
  if (req.headers.length) {
    parts.push(`headers {\n${serializeKVLines(req.headers)}\n}`);
  }

  if (req.auth.mode !== "none") {
    parts.push(`auth {\n  mode: ${req.auth.mode}\n}`);
    if (req.auth.mode === "bearer") {
      parts.push(`auth:bearer {\n  token: ${req.auth.token ?? ""}\n}`);
    } else if (req.auth.mode === "basic") {
      parts.push(
        `auth:basic {\n  username: ${req.auth.username ?? ""}\n  password: ${req.auth.password ?? ""}\n}`
      );
    }
  }

  if (req.bodyType !== "none" && req.body.trim() !== "") {
    const indented = req.body
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n");
    parts.push(`body:${req.bodyType} {\n${indented}\n}`);
  }

  if (req.localVars.length) {
    parts.push(`vars:local {\n${serializeKVLines(req.localVars)}\n}`);
  }

  if (
    !req.tls.verifySsl ||
    req.tls.caCert ||
    req.tls.clientCert ||
    req.tls.clientKey ||
    req.tls.clientKeyPass
  ) {
    const tlsLines = [
      `  verifySsl: ${req.tls.verifySsl}`,
      req.tls.caCert ? `  caCert: ${req.tls.caCert}` : null,
      req.tls.clientCert ? `  clientCert: ${req.tls.clientCert}` : null,
      req.tls.clientKey ? `  clientKey: ${req.tls.clientKey}` : null,
      req.tls.clientKeyPass ? `  clientKeyPass: ${req.tls.clientKeyPass}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
    parts.push(`tls {\n${tlsLines}\n}`);
  }

  if (req.docs && req.docs.trim() !== "") {
    const indented = req.docs
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n");
    parts.push(`docs {\n${indented}\n}`);
  }

  return parts.join("\n\n") + "\n";
}

export function emptyEnvironment(name = "New Environment"): NimbusEnvironment {
  return { name, vars: [] };
}

export function parseEnvFile(content: string, fallbackName: string): NimbusEnvironment {
  const blocks = splitBlocks(content);
  const map = blockMap(blocks);
  const env = emptyEnvironment(fallbackName);
  const vars = map.get("vars");
  if (vars) env.vars = parseKVLines(vars.lines);
  return env;
}

export function serializeEnvFile(env: NimbusEnvironment): string {
  return `vars {\n${serializeKVLines(env.vars)}\n}\n`;
}

export function newId(): string {
  return uid();
}