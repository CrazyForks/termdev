import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { CdpTarget } from "../types.ts";
import { ICONS, TARGET_ICONS, TARGET_LINES_PER_ITEM } from "../utils/constants.ts";
import { truncate } from "../utils/tree.ts";

type TargetListProps = {
  targets: CdpTarget[];
  selectedIndex: number;
  attachedIndex: number | null;
  focused: boolean;
  panelInnerHeight: number;
  columns: number;
  targetScrollTop: number;
};

function getTargetIcon(type: string): string {
  return TARGET_ICONS[type] ?? TARGET_ICONS.other ?? ICONS.plug;
}

function getTargetColor(
  type: string,
  selected: boolean,
  attached: boolean,
): string | undefined {
  if (attached) return "green";
  if (selected) return "cyan";
  switch (type) {
    case "page":
      return "white";
    case "service_worker":
      return "yellow";
    case "background_page":
      return "magenta";
    case "iframe":
      return "blue";
    default:
      return undefined;
  }
}

export function TargetList({
  targets,
  selectedIndex,
  attachedIndex,
  focused,
  panelInnerHeight,
  columns,
  targetScrollTop,
}: TargetListProps) {
  const visibleTargetItems = Math.max(
    1,
    Math.floor((panelInnerHeight - 1) / TARGET_LINES_PER_ITEM),
  );

  const targetsViewport = useMemo(() => {
    if (!targets.length)
      return [] as Array<{
        key: string;
        lines: [string, string];
        selected: boolean;
        attached: boolean;
        type: string;
        icon: string;
        color: string | undefined;
      }>;
    const slice = targets.slice(
      targetScrollTop,
      targetScrollTop + visibleTargetItems,
    );
    return slice.map((t, offset) => {
      const idx = targetScrollTop + offset;
      const selected = idx === selectedIndex;
      const attached = idx === attachedIndex;

      const title = (t.title ?? "").trim() || "(no title)";
      const url = (t.url ?? "").trim();
      const type = (t.type ?? "").trim();
      const icon = getTargetIcon(type);
      const color = getTargetColor(type, selected, attached);

      const statusIcon = attached ? "●" : selected ? "◦" : " ";
      const line1Prefix = `${icon} ${statusIcon} ${String(idx).padStart(2, " ")}`;
      const line1 = `${line1Prefix} ${title}`;
      const meta = [type ? `${type}` : "", url].filter(Boolean).join(" · ");
      const line2 = `      ${meta}`;

      const maxWidth = Math.max(10, Math.floor(columns * 0.33) - 6);
      return {
        key: t.id,
        lines: [truncate(line1, maxWidth), truncate(line2, maxWidth)] as [
          string,
          string,
        ],
        selected,
        attached,
        type,
        icon,
        color,
      };
    });
  }, [
    targets,
    targetScrollTop,
    visibleTargetItems,
    selectedIndex,
    attachedIndex,
    columns,
  ]);

  return (
    <Box
      flexDirection="column"
      width="33%"
      borderStyle="round"
      borderColor={focused ? "green" : "gray"}
      paddingX={1}
      paddingY={0}
      marginRight={1}
    >
      <Text bold color={focused ? "cyan" : undefined}>
        {ICONS.list} Targets{focused ? ` ${ICONS.star}` : ""}{" "}
        <Text dimColor>(↑↓ Enter)</Text>
      </Text>
      {targets.length === 0 ? (
        <Text dimColor>
          (no targets)
          {"\nPress r to refresh"}
        </Text>
      ) : (
        <Box flexDirection="column">
          {targetsViewport.map((item) => (
            <Box key={item.key} flexDirection="column">
              <Text
                color={item.color as any}
                bold={item.selected}
                inverse={item.selected}
              >
                {item.lines[0]}
              </Text>
              <Text dimColor color={item.attached ? "green" : undefined}>
                {item.lines[1]}
              </Text>
            </Box>
          ))}
          {targets.length > visibleTargetItems ? (
            <Text dimColor>
              {ICONS.bullet} {targetScrollTop + 1}-
              {Math.min(
                targetScrollTop + visibleTargetItems,
                targets.length,
              )}
              /{targets.length}
            </Text>
          ) : null}
        </Box>
      )}
    </Box>
  );
}
