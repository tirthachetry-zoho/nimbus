import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useStore } from "../lib/store";

function statusColor(status: number) {
  if (status === 0) return "text-err";
  if (status < 300) return "text-ok";
  if (status < 400) return "text-warn";
  return "text-err";
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export default function ResponseViewer() {
  const tab = useStore((s) => s.tabs.find((t) => t.path === s.activeTabPath));
  const [sub, setSub] = useState<"body" | "headers">("body");
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(() => (tab?.response ? prettyBody(tab.response.body) : ""), [tab?.response]);

  if (!tab) return <div className="w-[42%] shrink-0 border-l border-border bg-panel" />;

  if (tab.sending) {
    return (
      <div className="w-[42%] shrink-0 border-l border-border bg-panel flex items-center justify-center text-muted text-sm">
        Sending…
      </div>
    );
  }

  if (!tab.response) {
    return (
      <div className="w-[42%] shrink-0 border-l border-border bg-panel flex items-center justify-center text-muted text-sm text-center px-6">
        Send a request to see the response here.
      </div>
    );
  }

  const r = tab.response;

  if (r.error) {
    return (
      <div className="w-[42%] shrink-0 border-l border-border bg-panel flex flex-col">
        <div className="px-3 py-2.5 border-b border-border text-err text-sm font-medium">Request failed</div>
        <div className="p-3 font-mono text-sm text-err/90 whitespace-pre-wrap">{r.error}</div>
      </div>
    );
  }

  const headerEntries = Object.entries(r.headers);

  return (
    <div className="w-[42%] shrink-0 border-l border-border bg-panel flex flex-col min-w-0">
      <div className="px-3 py-2.5 border-b border-border flex items-center gap-4 text-sm">
        <span className={`font-mono font-semibold ${statusColor(r.status)}`}>
          {r.status} {r.status_text}
        </span>
        <span className="text-muted text-xs">{r.duration_ms} ms</span>
        <span className="text-muted text-xs">{formatBytes(r.size_bytes)}</span>
      </div>

      <div className="flex items-center gap-4 px-3 border-b border-border text-sm">
        {(["body", "headers"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={`py-2 border-b-2 -mb-px capitalize ${
              sub === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {key === "headers" ? `Headers (${headerEntries.length})` : "Body"}
          </button>
        ))}
        {sub === "body" && (
          <button
            className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-accent py-2"
            onClick={() => {
              navigator.clipboard.writeText(r.body);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {sub === "body" ? (
          <pre className="font-mono text-sm p-3 whitespace-pre-wrap break-words">{pretty || "(empty body)"}</pre>
        ) : (
          <div className="p-1">
            {headerEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 px-2 py-1 text-sm border-b border-border/40">
                <span className="font-mono text-accent shrink-0">{k}</span>
                <span className="font-mono text-text/90 break-all">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
