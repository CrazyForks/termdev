import React, { useMemo } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { FlatLogLine } from "../types/log.ts";
import { ICONS } from "../utils/constants.ts";
import { truncate, clamp } from "../utils/tree.ts";

type RightTab = "logs" | "network";

type RightPanelProps = {
  focused: boolean;
  rightTab: RightTab;
  flatLogs: FlatLogLine[];
  flatNet: FlatLogLine[];
  selectedLogNodeId: string | null;
  selectedNetNodeId: string | null;
  logScrollTop: number;
  netScrollTop: number;
  followTail: boolean;
  followNetTail: boolean;
  visibleLogLines: number;
  evalOpen: boolean;
  evalText: string;
  setEvalText: (text: string) => void;
  logSearchOpen: boolean;
  logSearchQuery: string;
  setLogSearchQuery: (query: string) => void;
  netSearchOpen: boolean;
  netSearchQuery: string;
  setNetSearchQuery: (query: string) => void;
  columns: number;
};

function classifyLogLine(line: string): { color?: string; dim?: boolean } {
  const l = line.toLowerCase();
  if (
    l.includes("exception") ||
    l.includes("console.error") ||
    l.includes("log.error")
  )
    return { color: "red" };
  if (
    l.includes("warn") ||
    l.includes("warning") ||
    l.includes("console.warn") ||
    l.includes("log.warning")
  ) {
    return { color: "yellow" };
  }
  if (l.startsWith("[eval]")) return { color: "green" };
  if (l.startsWith("eval>") || l.startsWith("[eval]"))
    return { color: "green" };
  if (l.includes("[props]")) return { color: "cyan" };
  if (l.includes("net.request")) return { color: "cyan", dim: true };
  if (l.includes("net.response")) return { color: "cyan", dim: true };
  if (l.startsWith("[hint]")) return { color: "magenta" };
  if (l.startsWith("[attached]") || l.startsWith("[transport]"))
    return { color: "green" };
  const trimmed = line.trimStart();
  if (/^"[^"]+"\s*:/.test(trimmed)) return { color: "cyan" };
  if (/^\s*(null|true|false|-?\d+\.?\d*)\s*,?\s*$/.test(trimmed))
    return { color: "yellow" };
  return { dim: false };
}

export function RightPanel({
  focused,
  rightTab,
  flatLogs,
  flatNet,
  selectedLogNodeId,
  selectedNetNodeId,
  logScrollTop,
  netScrollTop,
  followTail,
  followNetTail,
  visibleLogLines,
  evalOpen,
  evalText,
  setEvalText,
  logSearchOpen,
  logSearchQuery,
  setLogSearchQuery,
  netSearchOpen,
  netSearchQuery,
  setNetSearchQuery,
  columns,
}: RightPanelProps) {
  const activeFlat = rightTab === "logs" ? flatLogs : flatNet;
  const activeScrollTop = rightTab === "logs" ? logScrollTop : netScrollTop;
  const activeSelectedId =
    rightTab === "logs" ? selectedLogNodeId : selectedNetNodeId;
  const activeFollow = rightTab === "logs" ? followTail : followNetTail;

  const viewport = useMemo(() => {
    if (!activeFlat.length)
      return { start: 0, endExclusive: 0, lines: [] as FlatLogLine[] };
    const start = clamp(
      activeScrollTop,
      0,
      Math.max(0, activeFlat.length - visibleLogLines),
    );
    const endExclusive = clamp(start + visibleLogLines, 0, activeFlat.length);
    return {
      start,
      endExclusive,
      lines: activeFlat.slice(start, endExclusive),
    };
  }, [activeFlat, activeScrollTop, visibleLogLines]);

  return (
    <Box
      flexDirection="column"
      width="67%"
      borderStyle="round"
      borderColor={focused ? "green" : "gray"}
      paddingX={1}
    >
      <Text bold>
        <Text
          color={rightTab === "logs" ? "yellowBright" : "gray"}
          bold={rightTab === "logs"}
        >
          {ICONS.list} Logs
        </Text>
        <Text dimColor> │ </Text>
        <Text
          color={rightTab === "network" ? "magentaBright" : "gray"}
          bold={rightTab === "network"}
        >
          {ICONS.network} Network
        </Text>
        <Text dimColor>{"  "}</Text>
        <Text color="gray">
          ({viewport.start + 1}-{viewport.endExclusive}/{activeFlat.length})
        </Text>
        <Text color={activeFollow ? "green" : "yellow"}>
          {activeFollow
            ? ` ${ICONS.connected} follow`
            : ` ${ICONS.disconnected} paused`}
        </Text>
        {focused ? (
          <Text color="greenBright"> {ICONS.star}</Text>
        ) : null}
      </Text>
      <Box flexDirection="column">
        {viewport.lines.map((line, i) => {
          const idx = viewport.start + i;
          const isSelected =
            focused &&
            activeFlat[idx]?.nodeId === activeSelectedId;

          const icon = line.expandable
            ? line.expanded
              ? ICONS.expand
              : ICONS.collapse
            : " ";
          const prefix = `${" ".repeat(line.indent * 2)}${icon} `;
          const rendered = `${prefix}${line.text}`;

          const style = classifyLogLine(line.text);
          return (
            <Text
              key={line.nodeId}
              inverse={isSelected}
              color={style.color as any}
              dimColor={style.dim || (!isSelected && !focused)}
            >
              {truncate(
                rendered,
                Math.max(10, Math.floor(columns * 0.67) - 6),
              )}
            </Text>
          );
        })}
      </Box>

      {evalOpen ? (
        <Box marginTop={0}>
          <Text color="greenBright" bold>
            {ICONS.zap} js›{" "}
          </Text>
          <TextInput value={evalText} onChange={setEvalText} />
          <Text dimColor> (Enter run, Esc cancel)</Text>
        </Box>
      ) : netSearchOpen ? (
        <Box marginTop={0}>
          <Text color="cyanBright" bold>
            {ICONS.search} /{" "}
          </Text>
          <TextInput value={netSearchQuery} onChange={setNetSearchQuery} />
          <Text dimColor> (Enter done, Esc close, Ctrl+U clear)</Text>
        </Box>
      ) : logSearchOpen ? (
        <Box marginTop={0}>
          <Text color="cyanBright" bold>
            {ICONS.search} /{" "}
          </Text>
          <TextInput value={logSearchQuery} onChange={setLogSearchQuery} />
          <Text dimColor> (Enter done, Esc close, Ctrl+U clear)</Text>
        </Box>
      ) : (
        <Text dimColor>
          <Text color="yellow">l</Text> logs <Text color="yellow">n</Text>{" "}
          network <Text color="yellow">j/k</Text> select{" "}
          <Text color="yellow">z</Text> expand <Text color="yellow">/</Text>{" "}
          filter <Text color="yellow">:</Text> eval
        </Text>
      )}
    </Box>
  );
}
