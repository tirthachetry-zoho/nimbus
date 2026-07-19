import { useEffect, useState } from "react";
import { useStore } from "../lib/store";

export default function PromptModal() {
  const promptState = useStore((s) => s.promptState);
  const resolvePrompt = useStore((s) => s.resolvePrompt);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (promptState.open) setValue(promptState.defaultValue);
  }, [promptState.open, promptState.defaultValue]);

  if (!promptState.open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-panel border border-border rounded-md w-80 shadow-2xl">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">{promptState.title}</div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-muted text-xs">{promptState.message}</p>
          <input
            autoFocus
            className="bg-panel2 border border-border rounded-sm px-3 py-1.5 font-mono text-sm outline-none focus:border-accent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") resolvePrompt(value.trim() || null);
              else if (e.key === "Escape") resolvePrompt(null);
            }}
          />
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-sm border border-border rounded-sm hover:bg-panel2"
            onClick={() => resolvePrompt(null)}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-accent text-base rounded-sm font-medium hover:brightness-110"
            onClick={() => resolvePrompt(value.trim() || null)}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}