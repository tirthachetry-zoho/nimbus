import { invoke } from "@tauri-apps/api/core";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { FsNode, HttpResponse, KeyValue, NimbusRequest, TlsSettings } from "./types";

export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  if (!result) return null;
  return Array.isArray(result) ? result[0] : result;
}

export async function pickFile(extensions?: string[]): Promise<string | null> {
  const filters = extensions ? [{ name: "Files", extensions }] : undefined;
  const result = await open({ directory: false, multiple: false, filters });
  if (!result) return null;
  return Array.isArray(result) ? result[0] : result;
}

export async function pickSavePath(defaultPath?: string, extensions?: string[]): Promise<string | null> {
  const filters = extensions ? [{ name: "Files", extensions }] : undefined;
  const result = await save({ defaultPath, filters });
  if (!result) return null;
  return result;
}

export async function confirmAction(message: string, title?: string): Promise<boolean> {
  return confirm(message, title);
}

export async function listTree(root: string): Promise<FsNode[]> {
  return invoke<FsNode[]>("list_tree", { root });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke("create_directory", { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  return invoke("rename_path", { from, to });
}

export async function deletePath(path: string): Promise<void> {
  return invoke("delete_path", { path });
}

export async function collectionVars(requestPath: string): Promise<KeyValue[]> {
  const pairs = await invoke<[string, string][]>("collection_vars", { requestPath });
  return pairs.map(([key, value], i) => ({ id: `cv_${i}`, key, value, enabled: true }));
}

function resolveVars(input: string, vars: KeyValue[]): string {
  let out = input;
  for (const v of vars) {
    if (!v.enabled || !v.key) continue;
    out = out.split(`{{${v.key}}}`).join(v.value);
  }
  return out;
}

export function interpolate(input: string, vars: KeyValue[]): string {
  return resolveVars(input, vars);
}

export async function sendRequest(req: NimbusRequest, envVars: KeyValue[]): Promise<HttpResponse> {
  const headers: Record<string, string> = {};
  for (const h of req.headers) {
    if (h.enabled && h.key.trim()) headers[interpolate(h.key, envVars)] = interpolate(h.value, envVars);
  }

  if (req.auth.mode === "bearer" && req.auth.token) {
    headers["Authorization"] = `Bearer ${interpolate(req.auth.token, envVars)}`;
  } else if (req.auth.mode === "basic" && req.auth.username) {
    const raw = `${interpolate(req.auth.username, envVars)}:${interpolate(req.auth.password ?? "", envVars)}`;
    headers["Authorization"] = `Basic ${btoa(raw)}`;
  }

  if (req.bodyType === "json" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  } else if (req.bodyType === "xml" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/xml";
  } else if (req.bodyType === "form" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const enabledParams = req.params.filter((p) => p.enabled && p.key.trim());
  let url = interpolate(req.url, envVars);
  if (enabledParams.length) {
    const usp = new URLSearchParams();
    for (const p of enabledParams) usp.append(interpolate(p.key, envVars), interpolate(p.value, envVars));
    url += (url.includes("?") ? "&" : "?") + usp.toString();
  }

  let body = req.body;
  if (req.bodyType === "form") {
    // form body stored as key: value lines -> urlencoded
    const usp = new URLSearchParams();
    for (const line of req.body.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      usp.append(line.slice(0, idx).trim(), interpolate(line.slice(idx + 1).trim(), envVars));
    }
    body = usp.toString();
  } else {
    body = interpolate(body, envVars);
  }

  const tls: TlsSettings = req.tls;
  try {
    const resp = await invoke<HttpResponse>("send_request", {
      payload: {
        method: req.method,
        url,
        headers,
        body: req.bodyType === "none" ? null : body,
        body_type: req.bodyType,
        timeout_ms: 30000,
        verify_ssl: tls.verifySsl,
        ca_cert: tls.caCert || null,
        client_cert: tls.clientCert || null,
        client_key: tls.clientKey || null,
        client_key_pass: tls.clientKeyPass || null,
      },
    });
    return resp;
  } catch (e) {
    return {
      status: 0,
      status_text: "Error",
      headers: {},
      body: "",
      duration_ms: 0,
      size_bytes: 0,
      error: String(e),
    };
  }
}