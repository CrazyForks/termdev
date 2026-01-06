import type { LogNode, FlatLogLine, RemoteObject } from "../types/log.ts";
import { formatRemoteObject } from "../format.ts";

export function splitLines(s: string): string[] {
  return String(s).split("\n");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function truncate(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max === 1) return "…";
  return `${s.slice(0, max - 1)}…`;
}

export function isObjectExpandable(
  obj: RemoteObject | undefined,
): obj is RemoteObject & { objectId: string } {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      typeof (obj as RemoteObject).objectId === "string" &&
      (obj as RemoteObject).objectId!.length > 0,
  );
}

export function flattenLogTree(
  nodes: LogNode[],
  parentId: string | null = null,
  indent = 0,
): FlatLogLine[] {
  const out: FlatLogLine[] = [];
  for (const n of nodes) {
    const expandable =
      n.kind === "entry"
        ? (Array.isArray(n.args) && n.args.length > 0) ||
          (Array.isArray(n.children) && n.children.length > 0) ||
          Boolean(n.loading)
        : n.kind === "arg"
          ? isObjectExpandable(n.object)
          : n.kind === "prop"
            ? isObjectExpandable(n.value)
            : false;

    const expanded = Boolean(n.expanded);

    const text = (() => {
      if (n.kind === "text") return n.text ?? "";
      if (n.kind === "meta") return n.text ?? "";

      if (n.kind === "entry") {
        const label = n.label ?? "";
        const args = Array.isArray(n.args) ? n.args : [];
        const preview = args.map(formatRemoteObject).join(" ");
        return preview ? `${label} ${preview}` : label;
      }

      if (n.kind === "arg") {
        const obj = n.object;
        return obj ? formatRemoteObject(obj) : "";
      }

      if (n.kind === "prop") {
        const name = n.name ?? "?";
        const v = n.value;
        return `${name}: ${v ? formatRemoteObject(v) : "undefined"}`;
      }

      return n.text ?? "";
    })();

    out.push({ nodeId: n.id, parentId, indent, text, expandable, expanded });

    if (expanded && Array.isArray(n.children) && n.children.length > 0) {
      out.push(...flattenLogTree(n.children, n.id, indent + 1));
    }
  }
  return out;
}

export function updateNodeById(
  nodes: LogNode[],
  id: string,
  updater: (n: LogNode) => LogNode,
): LogNode[] {
  let changed = false;
  const next = nodes.map((n) => {
    if (n.id === id) {
      changed = true;
      return updater(n);
    }
    if (n.children && n.children.length > 0) {
      const updatedChildren = updateNodeById(n.children, id, updater);
      if (updatedChildren !== n.children) {
        changed = true;
        return { ...n, children: updatedChildren };
      }
    }
    return n;
  });
  return changed ? next : nodes;
}

export function findNodeById(nodes: LogNode[], id: string): LogNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function serializeNodeDeep(node: LogNode, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  const line = (() => {
    if (node.kind === "text" || node.kind === "meta")
      return `${pad}${node.text ?? ""}`.trimEnd();
    if (node.kind === "entry") {
      const label = node.label ?? "";
      const args = Array.isArray(node.args) ? node.args : [];
      const preview = args.map(formatRemoteObject).join(" ");
      return `${pad}${
        preview ? `${label} ${preview}`.trimEnd() : label
      }`.trimEnd();
    }
    if (node.kind === "arg") {
      return `${pad}${
        node.object ? formatRemoteObject(node.object) : ""
      }`.trimEnd();
    }
    if (node.kind === "prop") {
      const name = node.name ?? "?";
      return `${pad}${name}: ${
        node.value ? formatRemoteObject(node.value) : "undefined"
      }`.trimEnd();
    }
    return `${pad}${node.text ?? ""}`.trimEnd();
  })();

  const out = [line];
  const children = Array.isArray(node.children) ? node.children : [];
  for (const c of children) out.push(...serializeNodeDeep(c, indent + 1));
  return out;
}

export function serializeBodyOnly(node: LogNode): string[] {
  if (node.kind === "meta") {
    return [];
  }
  if (node.kind === "text") {
    return [node.text ?? ""];
  }
  if (node.kind === "entry" && node.net?.role === "body") {
    const children = Array.isArray(node.children) ? node.children : [];
    const out: string[] = [];
    for (const c of children) {
      out.push(...serializeBodyOnly(c));
    }
    return out;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  const out: string[] = [];
  for (const c of children) {
    out.push(...serializeBodyOnly(c));
  }
  return out;
}

export function tryPrettifyJson(body: string): { formatted: string; isJson: boolean } {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { formatted: body, isJson: false };
  }
  try {
    const parsed = JSON.parse(trimmed);
    const pretty = JSON.stringify(parsed, null, 2);
    return { formatted: pretty, isJson: true };
  } catch {
    return { formatted: body, isJson: false };
  }
}

export function formatResponseBody(
  body: string,
  base64Encoded: boolean,
): { lines: string[]; typeHint: string } {
  if (base64Encoded) {
    const preview = body.length > 100 ? body.slice(0, 100) + "..." : body;
    return { lines: [preview], typeHint: "(base64 encoded)" };
  }

  const { formatted, isJson } = tryPrettifyJson(body);
  const lines = splitLines(formatted);
  const typeHint = isJson ? "(json, formatted)" : "(text)";
  return { lines, typeHint };
}
