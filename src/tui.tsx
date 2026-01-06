import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Box, render, useApp, useInput, useStdout } from "ink";

import type { CliOptions } from "./cli.ts";
import { formatTime } from "./format.ts";

import { useTargets } from "./hooks/useTargets.ts";
import { useCdpClient, type CdpClientCallbacks } from "./hooks/useCdpClient.ts";
import { useLogTree } from "./hooks/useLogTree.ts";
import { useNetTree } from "./hooks/useNetTree.ts";
import { useClipboard } from "./hooks/useClipboard.ts";

import { LogoScreen } from "./components/LogoScreen.tsx";
import { Header } from "./components/Header.tsx";
import { Footer } from "./components/Footer.tsx";
import { TargetList } from "./components/TargetList.tsx";
import { RightPanel } from "./components/RightPanel.tsx";

import {
  HEADER_HEIGHT,
  FOOTER_HEIGHT,
  MIN_ROWS,
  TARGET_LINES_PER_ITEM,
} from "./utils/constants.ts";
import { clamp, findNodeById, serializeNodeDeep, serializeBodyOnly } from "./utils/tree.ts";

type RuntimeOptions = {
  host: string;
  port: number;
  network: boolean;
  pollMs: number;
  targetQuery?: string;
};

type AppProps = {
  opts: RuntimeOptions;
};

type Focus = "targets" | "right";
type RightTab = "logs" | "network";

function useTerminalSizeFallback(): { rows: number; columns: number } {
  const { stdout } = useStdout();
  const rows = (stdout as { rows?: number })?.rows;
  const columns = (stdout as { columns?: number })?.columns;
  return {
    rows: typeof rows === "number" && rows > 0 ? rows : 30,
    columns: typeof columns === "number" && columns > 0 ? columns : 100,
  };
}

function App({ opts }: AppProps) {
  const { exit } = useApp();
  const { rows, columns } = useTerminalSizeFallback();
  const safeRows = Math.max(MIN_ROWS, rows);

  const [showLogo, setShowLogo] = useState(true);
  const [focus, setFocus] = useState<Focus>("targets");
  const [rightTab, setRightTab] = useState<RightTab>("logs");
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalText, setEvalText] = useState("");
  const [targetScrollTop, setTargetScrollTop] = useState(0);

  const isAttachingRef = useRef(false);

  const mainHeight = Math.max(1, safeRows - HEADER_HEIGHT - FOOTER_HEIGHT);
  const panelInnerHeight = Math.max(3, mainHeight - 2);
  const rightReserved = evalOpen ? 2 : 1;
  const visibleLogLines = Math.max(3, panelInnerHeight - 1 - rightReserved);
  const visibleTargetItems = Math.max(
    1,
    Math.floor((panelInnerHeight - 1) / TARGET_LINES_PER_ITEM),
  );

  const logTreeHook = useLogTree(visibleLogLines);
  const {
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
    logTree,
  } = logTreeHook;

  const netTreeHook = useNetTree(visibleLogLines);
  const {
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
    netTree,
  } = netTreeHook;

  const { copyToClipboard } = useClipboard();

  const targetsHook = useTargets(
    opts.host,
    opts.port,
    opts.pollMs,
    opts.targetQuery,
    appendTextLog,
  );
  const {
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
  } = targetsHook;

  const cdpCallbacks = useMemo<CdpClientCallbacks>(() => ({
    onLog: (label, args, timestamp) => {
      const time = formatTime(timestamp ?? Date.now());
      appendEntryLog(`[${time}] ${label}`, args, timestamp);
    },
    onTextLog: (text) => {
      const time = formatTime(Date.now());
      appendTextLog(`[${time}] ${text}`);
    },
    onNetworkRequest: (rid, patch) => {
      upsertNet(rid, patch);
      ensureNetRequestNode(rid);
    },
    onNetworkResponse: (rid, patch) => {
      upsertNet(rid, patch);
      ensureNetRequestNode(rid);
      updateNetNodeLabel(rid);
    },
    onNetworkFinished: (rid, patch) => {
      upsertNet(rid, patch);
      ensureNetRequestNode(rid);
      updateNetNodeLabel(rid);
    },
    onNetworkFailed: (rid, patch) => {
      upsertNet(rid, patch);
      ensureNetRequestNode(rid);
      updateNetNodeLabel(rid);
    },
    onDisconnect: () => {
      appendTextLog("[transport] disconnected");
      setStatus("disconnected (press r to refresh targets)");
      setAttachedIndex(null);
    },
  }), [appendEntryLog, appendTextLog, upsertNet, ensureNetRequestNode, updateNetNodeLabel, setStatus, setAttachedIndex]);

  const cdpClientHook = useCdpClient(cdpCallbacks, { network: opts.network });
  const {
    attach,
    detach,
    evaluate,
    getProperties,
    getResponseBody,
    ping,
  } = cdpClientHook;

  const attachByIndex = useCallback(async (index: number) => {
    if (isAttachingRef.current) return;
    isAttachingRef.current = true;
    try {
      const t = targets[index];
      if (!t) {
        setStatus("invalid selection");
        return;
      }

      const title = (t.title ?? "").trim() || "(no title)";
      setStatus(`attaching: ${title}`);

      const success = await attach(t, host, opts.port);
      if (!success) {
        setStatus(`attach failed: ${title}`);
        return;
      }

      setAttachedIndex(index);
      appendTextLog(`[attached] ${title}`);
      setStatus(`attached: ${title}  |  ${host}:${opts.port}`);
      setFocus("right");
      setRightTab("logs");
    } finally {
      isAttachingRef.current = false;
    }
  }, [targets, host, opts.port, attach, setStatus, setAttachedIndex, appendTextLog]);

  const handleDetach = useCallback(async () => {
    await detach();
    setAttachedIndex(null);
    setStatus(`detached  |  ${host}:${opts.port}`);
  }, [detach, setAttachedIndex, setStatus, host, opts.port]);

  const submitEval = useCallback(async () => {
    const expr = evalText.trim();
    setEvalText("");
    setEvalOpen(false);

    if (!expr) return;

    appendTextLog(`[eval] ${expr}`);

    const result = await evaluate(expr);
    if (!result) {
      appendTextLog("[eval] ! not attached (select a target and press Enter)");
      return;
    }

    if (result.exceptionDetails) {
      const text = String(result.exceptionDetails.text ?? "exception");
      appendTextLog(`[eval] ! ${text}`);
      if (result.exceptionDetails.exception) {
        appendEntryLog(`eval!`, [result.exceptionDetails.exception], Date.now());
      }
      return;
    }

    if (result.result) {
      appendEntryLog(`eval =>`, [result.result], Date.now());
    }
  }, [evalText, evaluate, appendTextLog, appendEntryLog]);

  useEffect(() => {
    if (!opts.targetQuery) return;
    if (!targets.length) return;
    const picked = getAutoAttachTarget();
    if (picked) {
      setSelectedIndex(picked.index);
      void attachByIndex(picked.index);
    } else {
      appendTextLog(`[auto-attach] no match for: ${opts.targetQuery}`);
    }
  }, [targets.length > 0]);

  useEffect(() => {
    return () => {
      void handleDetach();
    };
  }, []);

  useEffect(() => {
    setTargetScrollTop((top) => {
      const maxTop = Math.max(0, targets.length - visibleTargetItems);
      const curTop = clamp(top, 0, maxTop);
      if (selectedIndex < curTop) return selectedIndex;
      if (selectedIndex >= curTop + visibleTargetItems)
        return selectedIndex - visibleTargetItems + 1;
      return curTop;
    });
  }, [selectedIndex, targets.length, visibleTargetItems]);

  useEffect(() => {
    if (focus !== "right" || rightTab !== "logs") return;
    if (!flatLogs.length) return;
    if (selectedLogIndex < 0) return;

    setLogScrollTop((top) => {
      const maxTop = Math.max(0, flatLogs.length - visibleLogLines);
      let nextTop = clamp(top, 0, maxTop);
      if (selectedLogIndex < nextTop) nextTop = selectedLogIndex;
      if (selectedLogIndex >= nextTop + visibleLogLines)
        nextTop = selectedLogIndex - visibleLogLines + 1;
      return nextTop;
    });
  }, [focus, rightTab, selectedLogIndex, flatLogs.length, visibleLogLines, setLogScrollTop]);

  useEffect(() => {
    if (focus !== "right" || rightTab !== "network") return;
    if (!flatNet.length) return;
    if (selectedNetIndex < 0) return;

    setNetScrollTop((top) => {
      const maxTop = Math.max(0, flatNet.length - visibleLogLines);
      let nextTop = clamp(top, 0, maxTop);
      if (selectedNetIndex < nextTop) nextTop = selectedNetIndex;
      if (selectedNetIndex >= nextTop + visibleLogLines)
        nextTop = selectedNetIndex - visibleLogLines + 1;
      return nextTop;
    });
  }, [focus, rightTab, selectedNetIndex, flatNet.length, visibleLogLines, setNetScrollTop]);

  useInput((input, key) => {
    if (evalOpen) {
      if (key.escape) {
        setEvalOpen(false);
        setEvalText("");
        return;
      }
      if (key.return) {
        void submitEval();
        return;
      }
      if (key.ctrl && input === "c") {
        exit();
        return;
      }
      return;
    }

    if (netSearchOpen) {
      if (key.escape) {
        setNetSearchOpen(false);
        return;
      }
      if (key.return) {
        setNetSearchOpen(false);
        return;
      }
      if (key.ctrl && input === "u") {
        setNetSearchQuery("");
        return;
      }
      if (key.ctrl && input === "c") {
        exit();
        return;
      }
      return;
    }

    if (logSearchOpen) {
      if (key.escape) {
        setLogSearchOpen(false);
        return;
      }
      if (key.return) {
        setLogSearchOpen(false);
        return;
      }
      if (key.ctrl && input === "u") {
        setLogSearchQuery("");
        return;
      }
      if (key.ctrl && input === "c") {
        exit();
        return;
      }
      return;
    }

    if (key.tab) {
      setFocus((f) => (f === "targets" ? "right" : "targets"));
      return;
    }

    if (input === "q" || key.escape) {
      exit();
      return;
    }
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (input === "r") {
      void refreshTargets();
      return;
    }

    if (input === ":") {
      setEvalOpen(true);
      setEvalText("");
      return;
    }

    if (focus === "targets") {
      if (key.upArrow || input === "k") {
        setSelectedIndex((i) =>
          clamp(i - 1, 0, Math.max(0, targets.length - 1)),
        );
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex((i) =>
          clamp(i + 1, 0, Math.max(0, targets.length - 1)),
        );
        return;
      }
      if (key.return) {
        void attachByIndex(selectedIndex);
        return;
      }
    } else {
      if (input === "l") {
        setRightTab("logs");
        return;
      }
      if (input === "n") {
        setRightTab("network");
        return;
      }
      if (input === "[" || input === "]") {
        setRightTab((t) => (t === "logs" ? "network" : "logs"));
        return;
      }

      const activeFlat = rightTab === "logs" ? flatLogs : flatNet;
      const activeIndex =
        rightTab === "logs" ? selectedLogIndex : selectedNetIndex;
      const setActiveSelected = (id: string | null) => {
        if (rightTab === "logs") setSelectedLogNodeId(id);
        else setSelectedNetNodeId(id);
      };
      const setActiveFollow = (v: boolean) => {
        if (rightTab === "logs") setFollowTail(v);
        else setFollowNetTail(v);
      };

      if (key.upArrow || input === "k") {
        if (!activeFlat.length) return;
        setActiveFollow(false);
        const nextIdx = clamp(activeIndex - 1, 0, activeFlat.length - 1);
        setActiveSelected(activeFlat[nextIdx]?.nodeId ?? null);
        return;
      }
      if (key.downArrow || input === "j") {
        if (!activeFlat.length) return;
        const nextIdx = clamp(activeIndex + 1, 0, activeFlat.length - 1);
        setActiveSelected(activeFlat[nextIdx]?.nodeId ?? null);
        if (nextIdx === activeFlat.length - 1) setActiveFollow(true);
        else setActiveFollow(false);
        return;
      }
      if (key.pageUp || (key.ctrl && input === "u")) {
        if (!activeFlat.length) return;
        setActiveFollow(false);
        const nextIdx = clamp(
          activeIndex - visibleLogLines,
          0,
          activeFlat.length - 1,
        );
        setActiveSelected(activeFlat[nextIdx]?.nodeId ?? null);
        return;
      }
      if (key.pageDown || (key.ctrl && input === "d")) {
        if (!activeFlat.length) return;
        const nextIdx = clamp(
          activeIndex + visibleLogLines,
          0,
          activeFlat.length - 1,
        );
        setActiveSelected(activeFlat[nextIdx]?.nodeId ?? null);
        if (nextIdx === activeFlat.length - 1) setActiveFollow(true);
        else setActiveFollow(false);
        return;
      }

      if (input === "z") {
        if (rightTab === "logs") {
          void toggleExpandSelected(getProperties);
        } else {
          void toggleNetExpandSelected(getResponseBody);
        }
        return;
      }

      if (input === "Z") {
        if (rightTab === "logs") collapseSelectedRegion();
        else collapseNetSelectedRegion();
        return;
      }

      if (input === "y") {
        if (!activeFlat.length) return;
        const nodeId =
          (rightTab === "logs" ? selectedLogNodeId : selectedNetNodeId) ??
          activeFlat[activeFlat.length - 1]?.nodeId;
        if (!nodeId) return;

        const root =
          rightTab === "logs"
            ? findNodeById(logTree, nodeId)
            : findNodeById(netTree, nodeId);
        if (!root) return;

        const text =
          root.net?.role === "body"
            ? serializeBodyOnly(root).join("\n")
            : serializeNodeDeep(root, 0).join("\n");
        void (async () => {
          const ok = await copyToClipboard(text);
          setStatus(ok ? "copied" : "copy failed (no clipboard tool)");
        })();
        return;
      }

      if (rightTab === "network" && input === "/") {
        setNetSearchOpen(true);
        setFollowNetTail(false);
        return;
      }

      if (rightTab === "logs" && input === "/") {
        setLogSearchOpen(true);
        setFollowTail(false);
        return;
      }
    }

    if (input === "d") {
      void handleDetach();
      return;
    }

    if (input === "p") {
      ping();
      return;
    }

    if (input === "c") {
      if (focus === "right" && rightTab === "network") {
        clearNetwork();
        setStatus("network cleared");
      } else {
        clearLogs();
        setStatus("logs cleared");
      }
      return;
    }

    if (input === "f") {
      if (focus === "right") {
        if (rightTab === "logs") setFollowTail(true);
        else setFollowNetTail(true);
      } else {
        setFollowTail(true);
      }
      return;
    }

    if (input === "?") {
      appendTextLog(
        "Keys: tab focus | q/esc quit | r refresh | targets: ↑↓/j k + enter attach | right: l logs / n network / [ ] switch | j/k select | z toggle | Z collapse | y copy | / filter | : eval | d detach | p ping | c clear(logs/network) | f follow",
      );
    }
  });

  const attachedTitle = useMemo(() => {
    if (attachedIndex == null) return null;
    const t = targets[attachedIndex];
    if (!t) return "(attached)";
    return (t.title ?? "").trim() || t.url || "(attached)";
  }, [targets, attachedIndex]);

  if (showLogo) {
    return <LogoScreen onDismiss={() => setShowLogo(false)} />;
  }

  const connectionStatus = attachedIndex !== null;

  return (
    <Box flexDirection="column" width="100%">
      <Header
        host={host}
        port={opts.port}
        connected={connectionStatus}
        targetsCount={targets.length}
        attachedTitle={attachedTitle}
        columns={columns}
      />

      <Box flexGrow={1} height={mainHeight}>
        <TargetList
          targets={targets}
          selectedIndex={selectedIndex}
          attachedIndex={attachedIndex}
          focused={focus === "targets"}
          panelInnerHeight={panelInnerHeight}
          columns={columns}
          targetScrollTop={targetScrollTop}
        />

        <RightPanel
          focused={focus === "right"}
          rightTab={rightTab}
          flatLogs={flatLogs}
          flatNet={flatNet}
          selectedLogNodeId={selectedLogNodeId}
          selectedNetNodeId={selectedNetNodeId}
          logScrollTop={logScrollTop}
          netScrollTop={netScrollTop}
          followTail={followTail}
          followNetTail={followNetTail}
          visibleLogLines={visibleLogLines}
          evalOpen={evalOpen}
          evalText={evalText}
          setEvalText={setEvalText}
          logSearchOpen={logSearchOpen}
          logSearchQuery={logSearchQuery}
          setLogSearchQuery={setLogSearchQuery}
          netSearchOpen={netSearchOpen}
          netSearchQuery={netSearchQuery}
          setNetSearchQuery={setNetSearchQuery}
          columns={columns}
        />
      </Box>

      <Footer
        connected={connectionStatus}
        status={status}
        columns={columns}
      />
    </Box>
  );
}

export async function runTui(opts: CliOptions): Promise<void> {
  const instance = render(
    <App
      opts={{
        host: opts.host,
        port: opts.port,
        network: opts.network,
        pollMs: opts.pollMs,
        targetQuery: opts.targetQuery,
      }}
    />,
  );

  await instance.waitUntilExit();
}
