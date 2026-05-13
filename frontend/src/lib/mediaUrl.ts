import { resolveApiBase } from "@/lib/apiBase";

const API_BASE = resolveApiBase();

export function resolveMediaUrl(path?: string, fallback = "") {
  if (!path) return fallback;
  if (path.startsWith("http")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
