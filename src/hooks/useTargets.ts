import { useState, useCallback, useEffect, useRef } from "react";
import { listTargets } from "../cdp.ts";
import { pickTargetByQuery } from "../targets.ts";
import type { CdpTarget } from "../types.ts";
import { clamp } from "../utils/tree.ts";

export type UseTargetsResult = {
  targets: CdpTarget[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  attachedIndex: number | null;
  setAttachedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  status: string;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  host: string;
  refreshTargets: (preferIndex?: number) => Promise<void>;
  getAutoAttachTarget: () => { target: CdpTarget; index: number } | null;
};

export function useTargets(
  initialHost: string,
  port: number,
  pollMs: number,
  targetQuery: string | undefined,
  onHint: (msg: string) => void,
): UseTargetsResult {
  const [host, setHost] = useState(initialHost);
  const [targets, setTargets] = useState<CdpTarget[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attachedIndex, setAttachedIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<string>(`connecting to ${initialHost}:${port}...`);

  const lastFetchErrorRef = useRef<string | null>(null);
  const hasShownConnectHelpRef = useRef(false);
  const selectedTargetIdRef = useRef<string | null>(null);
  const attachedTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedTargetIdRef.current = targets[selectedIndex]?.id ?? null;
  }, [targets, selectedIndex]);

  useEffect(() => {
    attachedTargetIdRef.current =
      attachedIndex == null ? null : (targets[attachedIndex]?.id ?? null);
  }, [targets, attachedIndex]);

  const refreshTargets = useCallback(
    async (preferIndex?: number) => {
      setStatus(`fetching targets from ${host}:${port} ...`);

      const fetch = async (h: string) => {
        return await listTargets({ host: h, port });
      };

      try {
        const t = await fetch(host);
        setTargets(t);
        const prevSelectedId = selectedTargetIdRef.current;
        const prevAttachedId = attachedTargetIdRef.current;

        const selectedById =
          prevSelectedId != null
            ? t.findIndex((x) => x.id === prevSelectedId)
            : -1;
        const attachedById =
          prevAttachedId != null
            ? t.findIndex((x) => x.id === prevAttachedId)
            : -1;

        const idxRaw =
          selectedById >= 0
            ? selectedById
            : typeof preferIndex === "number"
              ? preferIndex
              : selectedIndex;
        const idx = clamp(idxRaw, 0, Math.max(0, t.length - 1));
        setSelectedIndex(idx);

        setAttachedIndex(attachedById >= 0 ? attachedById : null);
        lastFetchErrorRef.current = null;
        setStatus(`targets: ${t.length}  |  ${host}:${port}`);
        return;
      } catch (err) {
        const firstErr = String(err);

        if (host === "localhost") {
          try {
            const t = await fetch("127.0.0.1");
            setHost("127.0.0.1");
            setTargets(t);
            const idx = clamp(
              typeof preferIndex === "number" ? preferIndex : selectedIndex,
              0,
              Math.max(0, t.length - 1),
            );
            setSelectedIndex(idx);
            onHint("[hint] localhost failed; switched host to 127.0.0.1");
            setStatus(`targets: ${t.length}  |  127.0.0.1:${port}`);
            return;
          } catch {
            // fallthrough
          }
        }

        if (lastFetchErrorRef.current !== firstErr) {
          onHint(firstErr);
          lastFetchErrorRef.current = firstErr;
        }
        setTargets([]);
        setStatus(`failed to fetch targets from ${host}:${port}`);

        if (!hasShownConnectHelpRef.current) {
          hasShownConnectHelpRef.current = true;
          onHint(
            [
              "[hint] Start Chrome with remote debugging enabled:",
              '  open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp',
              "[hint] Verify endpoint:",
              `  curl http://${host}:${port}/json/list`,
            ].join("\n"),
          );
        }
      }
    },
    [host, port, selectedIndex, onHint],
  );

  const getAutoAttachTarget = useCallback(() => {
    if (!targetQuery || !targets.length) return null;
    const picked = pickTargetByQuery(targets, targetQuery);
    if (picked.target && picked.index >= 0) {
      return { target: picked.target, index: picked.index };
    }
    return null;
  }, [targets, targetQuery]);

  useEffect(() => {
    void refreshTargets();
  }, []);

  useEffect(() => {
    if (!pollMs || pollMs <= 0) return;
    const id = setInterval(() => {
      void refreshTargets();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refreshTargets]);

  useEffect(() => {
    setSelectedIndex((i) => clamp(i, 0, Math.max(0, targets.length - 1)));
  }, [targets.length]);

  return {
    targets,
    selectedIndex,
    setSelectedIndex,
    attachedIndex,
    setAttachedIndex,
    status,
    setStatus,
    host,
    refreshTargets,
    getAutoAttachTarget,
  };
}
