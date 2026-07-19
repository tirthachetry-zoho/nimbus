import { useState } from "react";
import { Save, Send, Loader2, FolderOpen } from "lucide-react";
import { useStore } from "../lib/store";
import { BodyType, HttpMethod } from "../lib/types";
import * as api from "../lib/tauriApi";
import KeyValueEditor from "./KeyValueEditor";
import MethodBadge from "./MethodBadge";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "QUERY"];
const BODY_TYPES: BodyType[] = ["none", "json", "text", "xml", "form"];

type SubTab = "params" | "headers" | "body" | "auth" | "vars" | "tls" | "docs";

export default function RequestBuilder() {
  const activeTabPath = useStore((s) => s.activeTabPath);
  const tab = useStore((s) => s.tabs.find((t) => t.path === s.activeTabPath));
  const updateActiveRequest = useStore((s) => s.updateActiveRequest);
  const saveTab = useStore((s) => s.saveTab);
  const sendTabRequest = useStore((s) => s.sendTabRequest);
  const [sub, setSub] = useState<SubTab>("params");
  const [methodOpen, setMethodOpen] = useState(false);

  if (!tab || !activeTabPath) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Select or create a request to get started.
      </div>
    );
  }

  const req = tab.request;
  const enabledParams = req.params.filter((p) => p.enabled).length;
  const enabledHeaders = req.headers.filter((h) => h.enabled).length;

  async function browse(setter: (v: string) => void, current: string) {
    const picked = await api.pickFile();
    if (picked) setter(picked);
    else if (current) setter(current);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* name + url bar */}
      <div className="p-3 border-b border-border flex flex-col gap-2">
        <input
          className="bg-transparent text-sm font-medium outline-none w-full placeholder:text-muted/60"
          value={req.name}
          placeholder="Request name"
          onChange={(e) => updateActiveRequest({ name: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setMethodOpen((o) => !o)}
              className="flex items-center gap-1.5 border border-border rounded-sm px-2.5 py-1.5 bg-panel2 hover:brightness-110"
            >
              <MethodBadge method={req.method} />
            </button>
            {methodOpen && (
              <div className="absolute z-10 mt-1 bg-panel2 border border-border rounded-sm shadow-lg overflow-hidden w-32">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    className="w-full text-left px-3 py-1.5 hover:bg-base flex items-center"
                    onClick={() => {
                      updateActiveRequest({ method: m });
                      setMethodOpen(false);
                    }}
                  >
                    <MethodBadge method={m} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            className="flex-1 bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
            placeholder="https://api.example.com/resource"
            value={req.url}
            onChange={(e) => updateActiveRequest({ url: e.target.value })}
          />
          <button
            onClick={() => sendTabRequest(activeTabPath)}
            disabled={tab.sending || !req.url}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-base font-medium rounded-sm text-sm hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
          >
            {tab.sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
            Send
          </button>
          <button
            onClick={() => saveTab(activeTabPath)}
            disabled={!tab.dirty}
            title="Save (Ctrl/Cmd+S)"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-sm text-sm hover:bg-panel2 disabled:opacity-30"
          >
            <Save size={13} />
          </button>
        </div>
      </div>

      {/* sub tabs */}
      <div className="flex items-center gap-4 px-3 border-b border-border text-sm overflow-x-auto">
        {(
          [
            ["params", `Params${enabledParams ? ` (${enabledParams})` : ""}`],
            ["headers", `Headers${enabledHeaders ? ` (${enabledHeaders})` : ""}`],
            ["body", "Body"],
            ["auth", "Auth"],
            ["vars", `Vars${req.localVars.length ? ` (${req.localVars.length})` : ""}`],
            ["tls", "TLS"],
            ["docs", "Docs"],
          ] as [SubTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={`py-2 border-b-2 -mb-px whitespace-nowrap ${
              sub === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {sub === "params" && (
          <KeyValueEditor
            items={req.params}
            onChange={(params) => updateActiveRequest({ params })}
            keyPlaceholder="param"
            valuePlaceholder="value"
          />
        )}

        {sub === "headers" && (
          <KeyValueEditor
            items={req.headers}
            onChange={(headers) => updateActiveRequest({ headers })}
            keyPlaceholder="Header-Name"
            valuePlaceholder="value"
          />
        )}

        {sub === "body" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-3 py-2 border-b border-border/60">
              {BODY_TYPES.map((bt) => (
                <label key={bt} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    checked={req.bodyType === bt}
                    onChange={() => updateActiveRequest({ bodyType: bt })}
                    className="accent-accent"
                  />
                  {bt}
                </label>
              ))}
            </div>
            {req.bodyType === "none" ? (
              <p className="text-muted text-xs px-3 py-4">This request has no body.</p>
            ) : (
              <textarea
                className="flex-1 bg-transparent font-mono text-sm p-3 outline-none resize-none placeholder:text-muted/50"
                placeholder={
                  req.bodyType === "json"
                    ? '{\n  "key": "value"\n}'
                    : req.bodyType === "form"
                    ? "key: value"
                    : "raw body"
                }
                value={req.body}
                onChange={(e) => updateActiveRequest({ body: e.target.value })}
                spellCheck={false}
              />
            )}
          </div>
        )}

        {sub === "auth" && (
          <div className="p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3 text-xs">
              {(["none", "bearer", "basic"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={req.auth.mode === mode}
                    onChange={() => updateActiveRequest({ auth: { ...req.auth, mode } })}
                    className="accent-accent"
                  />
                  {mode === "none" ? "No Auth" : mode === "bearer" ? "Bearer Token" : "Basic Auth"}
                </label>
              ))}
            </div>
            {req.auth.mode === "bearer" && (
              <input
                className="bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
                placeholder="{{token}}"
                value={req.auth.token ?? ""}
                onChange={(e) => updateActiveRequest({ auth: { ...req.auth, token: e.target.value } })}
              />
            )}
            {req.auth.mode === "basic" && (
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
                  placeholder="username"
                  value={req.auth.username ?? ""}
                  onChange={(e) => updateActiveRequest({ auth: { ...req.auth, username: e.target.value } })}
                />
                <input
                  className="flex-1 bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
                  placeholder="password"
                  type="password"
                  value={req.auth.password ?? ""}
                  onChange={(e) => updateActiveRequest({ auth: { ...req.auth, password: e.target.value } })}
                />
              </div>
            )}
          </div>
        )}

        {sub === "vars" && (
          <div className="flex flex-col">
            <p className="text-muted text-xs px-3 py-2">
              Local variables override environment & collection variables. Reference with{" "}
              <span className="font-mono text-accent">{"{{name}}"}</span>.
            </p>
            <KeyValueEditor
              items={req.localVars}
              onChange={(localVars) => updateActiveRequest({ localVars })}
              keyPlaceholder="variable"
              valuePlaceholder="value"
            />
          </div>
        )}

        {sub === "tls" && (
          <div className="p-3 flex flex-col gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={req.tls.verifySsl}
                onChange={(e) => updateActiveRequest({ tls: { ...req.tls, verifySsl: e.target.checked } })}
                className="accent-accent"
              />
              Verify SSL certificate
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">CA certificate (PEM)</span>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
                  placeholder="/path/to/ca.pem"
                  value={req.tls.caCert}
                  onChange={(e) => updateActiveRequest({ tls: { ...req.tls, caCert: e.target.value } })}
                />
                <button
                  className="p-1.5 text-muted hover:text-accent border border-border rounded-sm"
                  title="Browse"
                  onClick={() => browse((v) => updateActiveRequest({ tls: { ...req.tls, caCert: v } }), req.tls.caCert)}
                >
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">Client certificate (PEM or .pfx/.p12)</span>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
                  placeholder="/path/to/client.crt"
                  value={req.tls.clientCert}
                  onChange={(e) => updateActiveRequest({ tls: { ...req.tls, clientCert: e.target.value } })}
                />
                <button
                  className="p-1.5 text-muted hover:text-accent border border-border rounded-sm"
                  title="Browse"
                  onClick={() => browse((v) => updateActiveRequest({ tls: { ...req.tls, clientCert: v } }), req.tls.clientCert)}
                >
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">Client key (PEM, if not bundled above)</span>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-xs outline-none focus:border-accent"
                  placeholder="/path/to/client.key"
                  value={req.tls.clientKey}
                  onChange={(e) => updateActiveRequest({ tls: { ...req.tls, clientKey: e.target.value } })}
                />
                <button
                  className="p-1.5 text-muted hover:text-accent border border-border rounded-sm"
                  title="Browse"
                  onClick={() => browse((v) => updateActiveRequest({ tls: { ...req.tls, clientKey: v } }), req.tls.clientKey)}
                >
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">Client key / PFX password</span>
              <input
                className="bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
                type="password"
                placeholder="optional"
                value={req.tls.clientKeyPass}
                onChange={(e) => updateActiveRequest({ tls: { ...req.tls, clientKeyPass: e.target.value } })}
              />
            </div>
          </div>
        )}

        {sub === "docs" && (
          <textarea
            className="w-full h-full bg-transparent text-sm p-3 outline-none resize-none placeholder:text-muted/50"
            placeholder="Notes about this request (markdown supported when rendered elsewhere)."
            value={req.docs ?? ""}
            onChange={(e) => updateActiveRequest({ docs: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}