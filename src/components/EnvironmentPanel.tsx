import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "../lib/store";
import * as api from "../lib/tauriApi";
import KeyValueEditor from "./KeyValueEditor";

export default function EnvironmentPanel({ onClose }: { onClose: () => void }) {
  const environments = useStore((s) => s.environments);
  const createEnvironment = useStore((s) => s.createEnvironment);
  const updateEnvironment = useStore((s) => s.updateEnvironment);
  const prompt = useStore((s) => s.prompt);
  const [selected, setSelected] = useState<string | null>(environments[0]?.path ?? null);

  const current = environments.find((e) => e.path === selected);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-panel border border-border rounded-md w-[720px] h-[480px] flex overflow-hidden shadow-2xl">
        <div className="w-56 border-r border-border flex flex-col">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">Environments</span>
            <button
              className="text-muted hover:text-accent"
              onClick={async () => {
                const name = await prompt("Environment name", "Local");
                if (name) createEnvironment(name);
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {environments.length === 0 && (
              <p className="text-muted text-xs p-3">No environments yet. Create one to store variables like base URLs and tokens.</p>
            )}
            {environments.map((e) => (
              <button
                key={e.path}
                onClick={() => setSelected(e.path)}
                className={`w-full text-left px-3 py-2 text-sm truncate ${
                  selected === e.path ? "bg-panel2 text-text" : "text-muted hover:bg-panel2/60"
                }`}
              >
                {e.env.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium truncate">{current ? current.env.name : "No environment selected"}</span>
            <button className="text-muted hover:text-text" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
          {current ? (
            <div className="flex-1 overflow-y-auto">
              <KeyValueEditor
                items={current.env.vars}
                onChange={(vars) => updateEnvironment(current.path, { ...current.env, vars })}
                keyPlaceholder="variable"
                valuePlaceholder="value"
              />
              <p className="text-muted text-xs px-3 py-2">
                Reference these anywhere with <span className="font-mono text-accent">{"{{variable}}"}</span>
              </p>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-sm">
              Select or create an environment
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
