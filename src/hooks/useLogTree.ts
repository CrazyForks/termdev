import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { LogNode, FlatLogLine, RemoteObject } from "../types/log.ts";
import { formatRemoteObject } from "../format.ts";
import {
  splitLines,
  clamp,
  flattenLogTree,
  updateNodeById,
  findNodeById,
  isObjectExpandable,
} from "../utils/tree.ts";
import { LOG_MAX_LINES } from "../utils/constants.ts";

export type UseLogTreeResult = {
  logTree: LogNode[];
  flatLogs: FlatLogLine[];
  selectedLogNodeId: string | null;
  setSelectedLogNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  followTail: boolean;
  setFollowTail: React.Dispatch<React.SetStateAction<boolean>>;
  logScrollTop: number;
  setLogScrollTop: React.Dispatch<React.SetStateAction<number>>;
  selectedLogIndex: number;
  logSearchQuery: string;
  setLogSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  logSearchOpen: boolean;
  setLogSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  appendTextLog: (line: string) => void;
  appendEntryLog: (label: string, args?: RemoteObject[], timestamp?: number) => void;
  clearLogs: () => void;
  toggleExpandSelected: (getProperties: (objectId: string) => Promise<LogNode[]>) => Promise<void>;
  collapseSelectedRegion: () => void;
  newNodeId: () => string;
};

export function useLogTree(visibleLogLines: number): UseLogTreeResult {
  const [logTree, setLogTree] = useState<LogNode[]>([]);
  const [followTail, setFollowTail] = useState(true);
  const [logScrollTop, setLogScrollTop] = useState(0);
  const [selectedLogNodeId, setSelectedLogNodeId] = useState<string | null>(null);
  const [logSearchOpen, setLogSearchOpen] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState("");

  const nextNodeIdRef = useRef(0);
  const isExpandingRef = useRef(false);

  const newNodeId = useCallback(() => `n${++nextNodeIdRef.current}`, []);

  const filteredLogTree = useMemo(() => {
    const q = logSearchQuery.trim().toLowerCase();
    if (!q) return logTree;

    return logTree.filter((n) => {
      const hay = `${n.label ?? ""} ${n.text ?? ""}`.toLowerCase();
      if (n.kind === "entry" && Array.isArray(n.args)) {
        const argsPreview = n.args
          .map(formatRemoteObject)
          .join(" ")
          .toLowerCase();
        if (argsPreview.includes(q)) return true;
      }
      return hay.includes(q);
    });
  }, [logTree, logSearchQuery]);

  const flatLogs = useMemo(
    () => flattenLogTree(filteredLogTree),
    [filteredLogTree],
  );

  const selectedLogIndex = useMemo(() => {
    if (!flatLogs.length) return -1;
    if (!selectedLogNodeId) return flatLogs.length - 1;
    const idx = flatLogs.findIndex((l) => l.nodeId === selectedLogNodeId);
    return idx >= 0 ? idx : flatLogs.length - 1;
  }, [flatLogs, selectedLogNodeId]);

  useEffect(() => {
    if (!flatLogs.length) {
      setSelectedLogNodeId(null);
      setLogScrollTop(0);
      return;
    }

    if (!selectedLogNodeId) {
      setSelectedLogNodeId(flatLogs[flatLogs.length - 1]?.nodeId ?? null);
    }

    if (followTail) {
      setSelectedLogNodeId(flatLogs[flatLogs.length - 1]?.nodeId ?? null);
      setLogScrollTop(Math.max(0, flatLogs.length - visibleLogLines));
      return;
    }

    setLogScrollTop((top) =>
      clamp(top, 0, Math.max(0, flatLogs.length - visibleLogLines)),
    );
  }, [flatLogs.length, followTail, visibleLogLines, selectedLogNodeId]);

  useEffect(() => {
    if (logSearchQuery.trim()) setFollowTail(false);
  }, [logSearchQuery]);

  const appendTextLog = useCallback((line: string) => {
    const newLines = splitLines(line);
    setLogTree((prev) => {
      let nodeCounter = nextNodeIdRef.current;
      const nodes = newLines.map((t) => ({
        id: `n${++nodeCounter}`,
        kind: "text" as const,
        text: t,
      }));
      nextNodeIdRef.current = nodeCounter;
      const next = prev.concat(nodes);
      if (next.length > LOG_MAX_LINES)
        return next.slice(next.length - LOG_MAX_LINES);
      return next;
    });
  }, []);

  const appendEntryLog = useCallback((
    label: string,
    args: RemoteObject[] = [],
    timestamp?: number,
  ) => {
    setLogTree((prev) => {
      const id = `n${++nextNodeIdRef.current}`;
      const next = prev.concat([
        {
          id,
          kind: "entry" as const,
          label,
          args,
          timestamp,
          expanded: false,
        },
      ]);
      if (next.length > LOG_MAX_LINES)
        return next.slice(next.length - LOG_MAX_LINES);
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogTree([]);
    setSelectedLogNodeId(null);
    setLogScrollTop(0);
    setFollowTail(true);
  }, []);

  const ensureEntryChildren = useCallback((node: LogNode): LogNode => {
    if (node.kind !== "entry") return node;
    if (node.children && node.children.length > 0) return node;
    const args = Array.isArray(node.args) ? node.args : [];
    let nodeCounter = nextNodeIdRef.current;
    const children: LogNode[] = args.map((obj, i) => ({
      id: `${node.id}:arg:${i}`,
      kind: "arg" as const,
      object: obj,
      expanded: false,
    }));
    nextNodeIdRef.current = nodeCounter;
    return { ...node, children };
  }, []);

  const toggleExpandSelected = useCallback(
    async (getProperties: (objectId: string) => Promise<LogNode[]>) => {
      if (isExpandingRef.current) return;
      if (!flatLogs.length) return;
      const nodeId = selectedLogNodeId ?? flatLogs[flatLogs.length - 1]?.nodeId;
      if (!nodeId) return;

      const node = findNodeById(logTree, nodeId);
      if (!node) return;

      const expandable =
        node.kind === "entry"
          ? Array.isArray(node.args) && node.args.length > 0
          : node.kind === "arg"
            ? isObjectExpandable(node.object)
            : node.kind === "prop"
              ? isObjectExpandable(node.value)
              : false;

      if (!expandable) return;

      const nextExpanded = !Boolean(node.expanded);

      if (node.kind === "entry") {
        const args = Array.isArray(node.args) ? node.args : [];
        const firstArg = args[0] as RemoteObject | undefined;
        const autoExpandArg0 =
          nextExpanded && args.length === 1 && isObjectExpandable(firstArg);
        const arg0 = autoExpandArg0 ? firstArg : null;
        const arg0Id = autoExpandArg0 ? `${nodeId}:arg:0` : null;

        setLogTree((prev) =>
          updateNodeById(prev, nodeId, (n) => {
            const ensured = ensureEntryChildren(n);
            if (!autoExpandArg0) return { ...ensured, expanded: nextExpanded };

            const children = Array.isArray(ensured.children)
              ? ensured.children
              : [];
            const first = children[0];
            const rest = children.slice(1);
            const updatedFirst = first
              ? {
                  ...first,
                  expanded: true,
                  loading: true,
                  children: [
                    {
                      id: `n${++nextNodeIdRef.current}`,
                      kind: "meta" as const,
                      text: "(loading properties...)",
                    },
                  ],
                }
              : first;
            return {
              ...ensured,
              expanded: nextExpanded,
              children: updatedFirst ? [updatedFirst, ...rest] : children,
            };
          }),
        );

        if (autoExpandArg0 && arg0 && arg0Id) {
          isExpandingRef.current = true;
          try {
            const children = await getProperties(arg0.objectId);
            setLogTree((prev) =>
              updateNodeById(prev, arg0Id, (n) => ({
                ...n,
                loading: false,
                children,
              })),
            );
          } catch (err) {
            setLogTree((prev) =>
              updateNodeById(prev, arg0Id, (n) => ({
                ...n,
                loading: false,
                children: [
                  {
                    id: `n${++nextNodeIdRef.current}`,
                    kind: "meta" as const,
                    text: `[props] ! ${String(err)}`,
                  },
                ],
              })),
            );
          } finally {
            isExpandingRef.current = false;
          }
        }
        return;
      }

      setLogTree((prev) =>
        updateNodeById(prev, nodeId, (n) => ({ ...n, expanded: nextExpanded })),
      );

      if (!nextExpanded) return;

      const obj = node.kind === "arg" ? node.object : node.value;
      if (!isObjectExpandable(obj)) return;

      if (
        Array.isArray(node.children) &&
        node.children.length > 0 &&
        !node.loading
      )
        return;

      isExpandingRef.current = true;
      setLogTree((prev) =>
        updateNodeById(prev, nodeId, (n) => ({
          ...n,
          loading: true,
          children: [
            {
              id: `n${++nextNodeIdRef.current}`,
              kind: "meta" as const,
              text: "(loading properties...)",
            },
          ],
        })),
      );

      try {
        const children = await getProperties(obj.objectId);
        setLogTree((prev) =>
          updateNodeById(prev, nodeId, (n) => ({
            ...n,
            loading: false,
            children,
          })),
        );
      } catch (err) {
        setLogTree((prev) =>
          updateNodeById(prev, nodeId, (n) => ({
            ...n,
            loading: false,
            children: [
              {
                id: `n${++nextNodeIdRef.current}`,
                kind: "meta" as const,
                text: `[props] ! ${String(err)}`,
              },
            ],
          })),
        );
      } finally {
        isExpandingRef.current = false;
      }
    },
    [logTree, flatLogs, selectedLogNodeId, ensureEntryChildren],
  );

  const collapseSelectedRegion = useCallback(() => {
    if (!flatLogs.length) return;
    const currentId =
      selectedLogNodeId ?? flatLogs[flatLogs.length - 1]?.nodeId;
    if (!currentId) return;

    const current = findNodeById(logTree, currentId);
    if (current?.expanded) {
      setLogTree((prev) =>
        updateNodeById(prev, currentId, (n) => ({ ...n, expanded: false })),
      );
      return;
    }

    const flatIndex = flatLogs.findIndex((l) => l.nodeId === currentId);
    if (flatIndex < 0) return;

    let parentId = flatLogs[flatIndex]?.parentId ?? null;
    while (parentId) {
      const parentNode = findNodeById(logTree, parentId);
      if (parentNode?.expanded) {
        const pid = parentId;
        setSelectedLogNodeId(pid);
        setLogTree((prev) =>
          updateNodeById(prev, pid, (n) => ({ ...n, expanded: false })),
        );
        return;
      }

      const parentFlatIndex = flatLogs.findIndex((l) => l.nodeId === parentId);
      parentId =
        parentFlatIndex >= 0 ? flatLogs[parentFlatIndex]!.parentId : null;
    }
  }, [logTree, flatLogs, selectedLogNodeId]);

  return {
    logTree,
    flatLogs,
    selectedLogNodeId,
    setSelectedLogNodeId,
    followTail,
    setFollowTail,
    logScrollTop,
    setLogScrollTop,
    selectedLogIndex,
    logSearchQuery,
    setLogSearchQuery,
    logSearchOpen,
    setLogSearchOpen,
    appendTextLog,
    appendEntryLog,
    clearLogs,
    toggleExpandSelected,
    collapseSelectedRegion,
    newNodeId,
  };
}
