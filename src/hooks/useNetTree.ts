import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { LogNode, FlatLogLine } from "../types/log.ts";
import type { NetRecord } from "../types/network.ts";
import { formatTime } from "../format.ts";
import {
  clamp,
  flattenLogTree,
  updateNodeById,
  findNodeById,
  splitLines,
  formatResponseBody,
} from "../utils/tree.ts";
import { NET_MAX_ITEMS, HEADER_LIMIT, BODY_LINE_LIMIT } from "../utils/constants.ts";

export type UseNetTreeResult = {
  netTree: LogNode[];
  flatNet: FlatLogLine[];
  selectedNetNodeId: string | null;
  setSelectedNetNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  followNetTail: boolean;
  setFollowNetTail: React.Dispatch<React.SetStateAction<boolean>>;
  netScrollTop: number;
  setNetScrollTop: React.Dispatch<React.SetStateAction<number>>;
  selectedNetIndex: number;
  netSearchQuery: string;
  setNetSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  netSearchOpen: boolean;
  setNetSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  clearNetwork: () => void;
  upsertNet: (rid: string, patch: Partial<NetRecord>) => void;
  ensureNetRequestNode: (rid: string) => void;
  updateNetNodeLabel: (rid: string) => void;
  toggleNetExpandSelected: (
    getResponseBody: (requestId: string) => Promise<{ body: string; base64Encoded: boolean }>,
  ) => Promise<void>;
  collapseNetSelectedRegion: () => void;
  getNetRecord: (rid: string) => NetRecord | undefined;
};

export function useNetTree(visibleLogLines: number): UseNetTreeResult {
  const [netTree, setNetTree] = useState<LogNode[]>([]);
  const [followNetTail, setFollowNetTail] = useState(true);
  const [netScrollTop, setNetScrollTop] = useState(0);
  const [selectedNetNodeId, setSelectedNetNodeId] = useState<string | null>(null);
  const [netSearchOpen, setNetSearchOpen] = useState(false);
  const [netSearchQuery, setNetSearchQuery] = useState("");

  const netByIdRef = useRef<Map<string, NetRecord>>(new Map());
  const isExpandingRef = useRef(false);
  const nextNodeIdRef = useRef(0);

  const newNodeId = useCallback(() => `net_n${++nextNodeIdRef.current}`, []);

  const filteredNetTree = useMemo(() => {
    const q = netSearchQuery.trim().toLowerCase();
    if (!q) return netTree;

    return netTree.filter((n) => {
      const hay = `${n.label ?? ""} ${n.text ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [netTree, netSearchQuery]);

  const flatNet = useMemo(
    () => flattenLogTree(filteredNetTree),
    [filteredNetTree],
  );

  const selectedNetIndex = useMemo(() => {
    if (!flatNet.length) return -1;
    if (!selectedNetNodeId) return flatNet.length - 1;
    const idx = flatNet.findIndex((l) => l.nodeId === selectedNetNodeId);
    return idx >= 0 ? idx : flatNet.length - 1;
  }, [flatNet, selectedNetNodeId]);

  useEffect(() => {
    if (!flatNet.length) {
      setSelectedNetNodeId(null);
      setNetScrollTop(0);
      return;
    }

    if (!selectedNetNodeId) {
      setSelectedNetNodeId(flatNet[flatNet.length - 1]?.nodeId ?? null);
    }

    if (followNetTail) {
      setSelectedNetNodeId(flatNet[flatNet.length - 1]?.nodeId ?? null);
      setNetScrollTop(Math.max(0, flatNet.length - visibleLogLines));
      return;
    }

    setNetScrollTop((top) =>
      clamp(top, 0, Math.max(0, flatNet.length - visibleLogLines)),
    );
  }, [flatNet.length, followNetTail, visibleLogLines, selectedNetNodeId]);

  useEffect(() => {
    if (netSearchQuery.trim()) setFollowNetTail(false);
  }, [netSearchQuery]);

  const upsertNet = useCallback((rid: string, patch: Partial<NetRecord>) => {
    const prev =
      netByIdRef.current.get(rid) ?? ({ requestId: rid } as NetRecord);
    netByIdRef.current.set(rid, { ...prev, ...patch });
  }, []);

  const getNetRecord = useCallback((rid: string) => {
    return netByIdRef.current.get(rid);
  }, []);

  const getNetLabel = useCallback((rid: string) => {
    const r = netByIdRef.current.get(rid);
    const time = formatTime(r?.startTimestamp ?? Date.now());
    const method = r?.method ?? "";
    const url = r?.url ?? "";
    const status = typeof r?.status === "number" ? r.status : undefined;
    const tail = r?.errorText
      ? ` ✖ ${r.errorText}`
      : status != null
        ? ` ${status}`
        : "";
    return `[${time}] ${method} ${url}${tail}`.trimEnd();
  }, []);

  const buildHeadersChildren = useCallback((headers?: Record<string, string>) => {
    const entries = Object.entries(headers ?? {});
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const sliced = entries.slice(0, HEADER_LIMIT);
    const children: LogNode[] = sliced.map(([k, v]) => ({
      id: newNodeId(),
      kind: "text" as const,
      text: `${k}: ${v}`,
    }));
    if (entries.length > HEADER_LIMIT) {
      children.push({
        id: newNodeId(),
        kind: "meta" as const,
        text: `… (${entries.length - HEADER_LIMIT} more headers)`,
      });
    }
    if (children.length === 0)
      children.push({
        id: newNodeId(),
        kind: "meta" as const,
        text: "(no headers)",
      });
    return children;
  }, [newNodeId]);

  const buildNetChildren = useCallback((rid: string): LogNode[] => {
    const r = netByIdRef.current.get(rid);
    const meta: LogNode[] = [];
    if (r?.type)
      meta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `type: ${r.type}`,
      });
    if (r?.initiator)
      meta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `initiator: ${r.initiator}`,
      });
    if (typeof r?.encodedDataLength === "number")
      meta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `bytes: ${r.encodedDataLength}`,
      });

    const reqHeadersNode: LogNode = {
      id: `net:${rid}:reqHeaders`,
      kind: "entry" as const,
      label: `Request Headers (${Object.keys(r?.requestHeaders ?? {}).length})`,
      expanded: false,
      children: buildHeadersChildren(r?.requestHeaders),
      net: { requestId: rid, role: "headers", which: "request" },
    };

    const resLineParts: string[] = [];
    if (typeof r?.status === "number") resLineParts.push(String(r.status));
    if (r?.statusText) resLineParts.push(r.statusText);
    if (r?.mimeType) resLineParts.push(r.mimeType);
    const resMeta: LogNode[] = [];
    if (r?.protocol)
      resMeta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `protocol: ${r.protocol}`,
      });
    if (r?.remoteIPAddress) {
      const port = typeof r.remotePort === "number" ? `:${r.remotePort}` : "";
      resMeta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `remote: ${r.remoteIPAddress}${port}`,
      });
    }
    if (r?.fromDiskCache)
      resMeta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `fromDiskCache: true`,
      });
    if (r?.fromServiceWorker)
      resMeta.push({
        id: newNodeId(),
        kind: "text" as const,
        text: `fromServiceWorker: true`,
      });

    const resHeadersNode: LogNode = {
      id: `net:${rid}:resHeaders`,
      kind: "entry" as const,
      label: `Response Headers (${
        Object.keys(r?.responseHeaders ?? {}).length
      })`,
      expanded: false,
      children: buildHeadersChildren(r?.responseHeaders),
      net: { requestId: rid, role: "headers", which: "response" },
    };

    const bodyNode: LogNode = {
      id: `net:${rid}:body`,
      kind: "entry" as const,
      label: "Response Body",
      expanded: false,
      children: [
        { id: newNodeId(), kind: "meta" as const, text: "(press z to load)" },
      ],
      net: { requestId: rid, role: "body" },
    };

    const responseNode: LogNode = {
      id: `net:${rid}:response`,
      kind: "entry" as const,
      label: `Response${
        resLineParts.length ? `: ${resLineParts.join(" ")}` : ""
      }`,
      expanded: false,
      children: [resHeadersNode, ...resMeta, bodyNode],
      net: { requestId: rid, role: "response" },
    };

    const reqBodyNode: LogNode = {
      id: `net:${rid}:reqBody`,
      kind: "entry" as const,
      label: "Request Body",
      expanded: false,
      children: [
        { id: newNodeId(), kind: "meta" as const, text: "(press z to view)" },
      ],
      net: { requestId: rid, role: "body", which: "request" },
    };

    const reqMeta: LogNode[] = [];
    if (r?.postData) {
      reqMeta.push(reqBodyNode);
    }

    return [...meta, reqHeadersNode, ...reqMeta, responseNode];
  }, [newNodeId, buildHeadersChildren]);

  const ensureNetRequestNode = useCallback((rid: string) => {
    setNetTree((prev) => {
      const id = `net:${rid}`;
      if (findNodeById(prev, id)) {
        return updateNodeById(prev, id, (n) => ({
          ...n,
          label: getNetLabel(rid),
        }));
      }
      const next = prev.concat([
        {
          id,
          kind: "entry" as const,
          label: getNetLabel(rid),
          expanded: false,
          net: { requestId: rid, role: "request" },
        },
      ]);
      return next.length > NET_MAX_ITEMS ? next.slice(next.length - NET_MAX_ITEMS) : next;
    });
  }, [getNetLabel]);

  const updateNetNodeLabel = useCallback((rid: string) => {
    const id = `net:${rid}`;
    setNetTree((prev) =>
      updateNodeById(prev, id, (n) => {
        const children =
          Array.isArray(n.children) && n.children.length > 0
            ? buildNetChildren(rid)
            : n.children;
        return { ...n, label: getNetLabel(rid), children };
      }),
    );
  }, [getNetLabel, buildNetChildren]);

  const clearNetwork = useCallback(() => {
    setNetTree([]);
    netByIdRef.current.clear();
    setSelectedNetNodeId(null);
    setNetScrollTop(0);
    setFollowNetTail(true);
    setNetSearchQuery("");
  }, []);

  const toggleNetExpandSelected = useCallback(
    async (
      getResponseBody: (requestId: string) => Promise<{ body: string; base64Encoded: boolean }>,
    ) => {
      if (isExpandingRef.current) return;
      if (!flatNet.length) return;
      const nodeId = selectedNetNodeId ?? flatNet[flatNet.length - 1]?.nodeId;
      if (!nodeId) return;

      const node = findNodeById(netTree, nodeId);
      if (!node) return;

      const hasChildren =
        Array.isArray(node.children) && node.children.length > 0;
      const expandable =
        node.kind === "entry" ? hasChildren || Boolean(node.net) : false;
      if (!expandable) return;

      const nextExpanded = !Boolean(node.expanded);

      if (node.net?.role === "request") {
        const rid = node.net.requestId;
        setNetTree((prev) =>
          updateNodeById(prev, nodeId, (n) => {
            const already = Array.isArray(n.children) && n.children.length > 0;
            const children = already ? n.children : buildNetChildren(rid);
            return { ...n, expanded: nextExpanded, children };
          }),
        );
        return;
      }

      if (node.net?.role === "body" && node.net?.which === "request") {
        const rid = node.net.requestId;
        setNetTree((prev) =>
          updateNodeById(prev, nodeId, (n) => ({ ...n, expanded: nextExpanded })),
        );
        if (!nextExpanded) return;

        const record = netByIdRef.current.get(rid);
        if (record?.postData) {
          const { lines, typeHint } = formatResponseBody(record.postData, false);
          const sliced = lines.slice(0, BODY_LINE_LIMIT);
          const children: LogNode[] = [
            { id: newNodeId(), kind: "meta" as const, text: typeHint },
            ...sliced.map((t) => ({
              id: newNodeId(),
              kind: "text" as const,
              text: t,
            })),
          ];
          if (lines.length > BODY_LINE_LIMIT) {
            children.push({
              id: newNodeId(),
              kind: "meta" as const,
              text: `… (${lines.length - BODY_LINE_LIMIT} more lines)`,
            });
          }
          setNetTree((prev) =>
            updateNodeById(prev, nodeId, (n) => ({ ...n, children })),
          );
          return;
        }
        return;
      }

      if (node.net?.role === "body") {
        const rid = node.net.requestId;
        setNetTree((prev) =>
          updateNodeById(prev, nodeId, (n) => ({ ...n, expanded: nextExpanded })),
        );
        if (!nextExpanded) return;

        const record = netByIdRef.current.get(rid);
        if (record?.responseBody) {
          const rb = record.responseBody;
          const { lines, typeHint } = formatResponseBody(
            rb.body,
            rb.base64Encoded,
          );
          const sliced = lines.slice(0, BODY_LINE_LIMIT);
          const children: LogNode[] = [
            { id: newNodeId(), kind: "meta" as const, text: typeHint },
            ...sliced.map((t) => ({
              id: newNodeId(),
              kind: "text" as const,
              text: t,
            })),
          ];
          if (lines.length > BODY_LINE_LIMIT) {
            children.push({
              id: newNodeId(),
              kind: "meta" as const,
              text: `… (${lines.length - BODY_LINE_LIMIT} more lines)`,
            });
          }
          setNetTree((prev) =>
            updateNodeById(prev, nodeId, (n) => ({ ...n, children })),
          );
          return;
        }

        isExpandingRef.current = true;
        setNetTree((prev) =>
          updateNodeById(prev, nodeId, (n) => ({
            ...n,
            loading: true,
            children: [
              {
                id: newNodeId(),
                kind: "meta" as const,
                text: "(loading response body...)",
              },
            ],
          })),
        );
        try {
          const body = await getResponseBody(rid);
          upsertNet(rid, { responseBody: body });
          const { lines, typeHint } = formatResponseBody(
            body.body,
            body.base64Encoded,
          );
          const sliced = lines.slice(0, BODY_LINE_LIMIT);
          const children: LogNode[] = [
            { id: newNodeId(), kind: "meta" as const, text: typeHint },
            ...sliced.map((t) => ({
              id: newNodeId(),
              kind: "text" as const,
              text: t,
            })),
          ];
          if (lines.length > BODY_LINE_LIMIT) {
            children.push({
              id: newNodeId(),
              kind: "meta" as const,
              text: `… (${lines.length - BODY_LINE_LIMIT} more lines)`,
            });
          }
          setNetTree((prev) =>
            updateNodeById(prev, nodeId, (n) => ({
              ...n,
              loading: false,
              children,
            })),
          );
        } catch (err) {
          setNetTree((prev) =>
            updateNodeById(prev, nodeId, (n) => ({
              ...n,
              loading: false,
              children: [
                {
                  id: newNodeId(),
                  kind: "meta" as const,
                  text: `[body] ! ${String(err)}`,
                },
              ],
            })),
          );
        } finally {
          isExpandingRef.current = false;
        }
        return;
      }

      setNetTree((prev) =>
        updateNodeById(prev, nodeId, (n) => ({ ...n, expanded: nextExpanded })),
      );
    },
    [netTree, flatNet, selectedNetNodeId, buildNetChildren, upsertNet, newNodeId],
  );

  const collapseNetSelectedRegion = useCallback(() => {
    if (!flatNet.length) return;
    const currentId = selectedNetNodeId ?? flatNet[flatNet.length - 1]?.nodeId;
    if (!currentId) return;

    const current = findNodeById(netTree, currentId);
    if (current?.expanded) {
      setNetTree((prev) =>
        updateNodeById(prev, currentId, (n) => ({ ...n, expanded: false })),
      );
      return;
    }

    const flatIndex = flatNet.findIndex((l) => l.nodeId === currentId);
    if (flatIndex < 0) return;
    let parentId = flatNet[flatIndex]?.parentId ?? null;
    while (parentId) {
      const parentNode = findNodeById(netTree, parentId);
      if (parentNode?.expanded) {
        const pid = parentId;
        setSelectedNetNodeId(pid);
        setNetTree((prev) =>
          updateNodeById(prev, pid, (n) => ({ ...n, expanded: false })),
        );
        return;
      }
      const parentFlatIndex = flatNet.findIndex((l) => l.nodeId === parentId);
      parentId =
        parentFlatIndex >= 0 ? flatNet[parentFlatIndex]!.parentId : null;
    }
  }, [netTree, flatNet, selectedNetNodeId]);

  return {
    netTree,
    flatNet,
    selectedNetNodeId,
    setSelectedNetNodeId,
    followNetTail,
    setFollowNetTail,
    netScrollTop,
    setNetScrollTop,
    selectedNetIndex,
    netSearchQuery,
    setNetSearchQuery,
    netSearchOpen,
    setNetSearchOpen,
    clearNetwork,
    upsertNet,
    ensureNetRequestNode,
    updateNetNodeLabel,
    toggleNetExpandSelected,
    collapseNetSelectedRegion,
    getNetRecord,
  };
}
