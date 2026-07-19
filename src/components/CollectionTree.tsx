import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderPlus, FilePlus, Trash2, Pencil } from "lucide-react";
import { FsNode, HttpMethod } from "../lib/types";
import { useStore } from "../lib/store";
import * as api from "../lib/tauriApi";
import MethodBadge from "./MethodBadge";

function RequestName({ name }: { name: string }) {
  return <span className="truncate">{name.replace(/\.nreq$/, "")}</span>;
}

export default function CollectionTree({ nodes, depth = 0 }: { nodes: FsNode[]; depth?: number }) {
  return (
    <div>
      {nodes.map((n) => (
        <TreeNode key={n.path} node={n} depth={depth} />
      ))}
    </div>
  );
}

function TreeNode({ node, depth }: { node: FsNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const openRequestFile = useStore((s) => s.openRequestFile);
  const createFolder = useStore((s) => s.createFolder);
  const createRequest = useStore((s) => s.createRequest);
  const deleteNode = useStore((s) => s.deleteNode);
  const renameNode = useStore((s) => s.renameNode);
  const prompt = useStore((s) => s.prompt);
  const activeTabPath = useStore((s) => s.activeTabPath);
  const [hover, setHover] = useState(false);

  if (node.is_dir) {
    return (
      <div>
        <div
          className="group flex items-center gap-1 px-2 py-1 rounded-sm cursor-pointer hover:bg-panel2 text-text"
          style={{ paddingLeft: 8 + depth * 14 }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={13} className="text-muted shrink-0" /> : <ChevronRight size={13} className="text-muted shrink-0" />}
          <Folder size={13} className="text-muted shrink-0" />
          <span className="truncate text-sm">{node.name}</span>
          {hover && (
            <span className="ml-auto flex items-center gap-1 shrink-0">
              <button
                title="New request"
                className="p-0.5 hover:text-accent text-muted"
                onClick={async (e) => {
                  e.stopPropagation();
                  const name = await prompt("Request name");
                  if (name) createRequest(node.path, name);
                }}
              >
                <FilePlus size={12} />
              </button>
              <button
                title="New folder"
                className="p-0.5 hover:text-accent text-muted"
                onClick={async (e) => {
                  e.stopPropagation();
                  const name = await prompt("Folder name");
                  if (name) createFolder(node.path, name);
                }}
              >
                <FolderPlus size={12} />
              </button>
              <button
                title="Rename"
                className="p-0.5 hover:text-accent text-muted"
                onClick={async (e) => {
                  e.stopPropagation();
                  const name = await prompt("Rename folder", node.name);
                  if (name && name !== node.name) renameNode(node.path, name);
                }}
              >
                <Pencil size={12} />
              </button>
              <button
                title="Delete"
                className="p-0.5 hover:text-err text-muted"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await api.confirmAction(`Delete folder "${node.name}" and everything in it?`)) deleteNode(node.path);
                }}
              >
                <Trash2 size={12} />
              </button>
            </span>
          )}
        </div>
        {open && node.children && <CollectionTree nodes={node.children} depth={depth + 1} />}
      </div>
    );
  }

  const method = node.method as HttpMethod | null;
  const isActive = activeTabPath === node.path;

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 rounded-sm cursor-pointer text-sm ${
        isActive ? "bg-panel2 text-text" : "hover:bg-panel2 text-text/90"
      }`}
      style={{ paddingLeft: 8 + depth * 14 + 15 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => openRequestFile(node.path)}
    >
      {method && <MethodBadge method={method} compact />}
      <RequestName name={node.name} />
      {hover && (
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <button
            title="Rename"
            className="p-0.5 hover:text-accent text-muted"
            onClick={async (e) => {
              e.stopPropagation();
              const name = await prompt("Rename request", node.name.replace(/\.nreq$/, ""));
              if (name) renameNode(node.path, name);
            }}
          >
            <Pencil size={12} />
          </button>
          <button
            title="Delete"
            className="p-0.5 hover:text-err text-muted"
            onClick={async (e) => {
              e.stopPropagation();
              if (await api.confirmAction(`Delete "${node.name}"?`)) deleteNode(node.path);
            }}
          >
            <Trash2 size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
