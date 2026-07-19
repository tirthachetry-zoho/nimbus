import { X } from "lucide-react";
import { useStore } from "../lib/store";
import MethodBadge from "./MethodBadge";

export default function Tabs() {
  const tabs = useStore((s) => s.tabs);
  const activeTabPath = useStore((s) => s.activeTabPath);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);

  if (!tabs.length) return null;

  return (
    <div className="flex items-stretch bg-base border-b border-border overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.path === activeTabPath;
        return (
          <div
            key={t.path}
            onClick={() => setActiveTab(t.path)}
            className={`group flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer shrink-0 max-w-[220px] ${
              isActive ? "bg-panel text-text" : "text-muted hover:bg-panel/50"
            }`}
          >
            <MethodBadge method={t.request.method} compact />
            <span className="truncate text-sm">
              {t.request.name || "Untitled Request"}
              {t.dirty && <span className="text-accent"> •</span>}
            </span>
            <button
              className="ml-1 opacity-0 group-hover:opacity-100 text-muted hover:text-text shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.path);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
