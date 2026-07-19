import { HttpMethod } from "../lib/types";

const COLORS: Record<HttpMethod, string> = {
  GET: "text-method-get",
  POST: "text-method-post",
  PUT: "text-method-put",
  DELETE: "text-method-delete",
  PATCH: "text-method-patch",
  HEAD: "text-method-other",
  OPTIONS: "text-method-other",
  QUERY: "text-method-query",
};

export default function MethodBadge({ method, compact = false }: { method: HttpMethod; compact?: boolean }) {
  return (
    <span
      className={`font-mono font-semibold ${COLORS[method]} ${compact ? "text-[10px]" : "text-xs"}`}
      style={{ width: compact ? 34 : 44, display: "inline-block", flexShrink: 0 }}
    >
      {compact ? method.slice(0, 3) : method}
    </span>
  );
}
