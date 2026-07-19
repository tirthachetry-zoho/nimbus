import { Plus, Trash2 } from "lucide-react";
import { KeyValue } from "../lib/types";

let counter = 0;
function uid() {
  counter += 1;
  return `kv_${Date.now()}_${counter}`;
}

export default function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  function update(id: string, patch: Partial<KeyValue>) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  function add() {
    onChange([...items, { id: uid(), key: "", value: "", enabled: true }]);
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 px-3 py-1 border-b border-border/60 group">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => update(item.id, { enabled: e.target.checked })}
            className="accent-accent shrink-0"
          />
          <input
            className="flex-1 bg-transparent font-mono text-sm py-1 outline-none placeholder:text-muted/60 disabled:opacity-40"
            placeholder={keyPlaceholder}
            value={item.key}
            disabled={!item.enabled}
            onChange={(e) => update(item.id, { key: e.target.value })}
          />
          <input
            className="flex-1 bg-transparent font-mono text-sm py-1 outline-none placeholder:text-muted/60 disabled:opacity-40"
            placeholder={valuePlaceholder}
            value={item.value}
            disabled={!item.enabled}
            onChange={(e) => update(item.id, { value: e.target.value })}
          />
          <button
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-err shrink-0"
            onClick={() => remove(item.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1.5 text-muted hover:text-accent text-xs px-3 py-2 self-start"
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}
