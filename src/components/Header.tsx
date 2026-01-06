import React from "react";
import { Box, Text } from "ink";
import gradient from "gradient-string";
import { ICONS, HEADER_GRADIENT_COLORS } from "../utils/constants.ts";
import { truncate } from "../utils/tree.ts";

type HeaderProps = {
  host: string;
  port: number;
  connected: boolean;
  targetsCount: number;
  attachedTitle: string | null;
  columns: number;
};

const headerGradient = gradient([...HEADER_GRADIENT_COLORS]);

export function Header({
  host,
  port,
  connected,
  targetsCount,
  attachedTitle,
  columns,
}: HeaderProps) {
  const headerTitle = headerGradient(`${ICONS.logo} TermDev`);

  return (
    <Box height={1}>
      <Text>{headerTitle}</Text>
      <Text dimColor> │ </Text>
      <Text color={connected ? "green" : "yellow"}>
        {connected ? ICONS.connected : ICONS.disconnected}
      </Text>
      <Text color={connected ? "green" : "yellow"}>
        {connected ? " connected" : " waiting"}
      </Text>
      <Text dimColor> │ </Text>
      <Text dimColor>
        {host}:{port}
      </Text>
      <Text dimColor> │ </Text>
      <Text color="cyan">{ICONS.list} </Text>
      <Text color="cyanBright" bold>
        {targetsCount}
      </Text>
      {attachedTitle ? (
        <>
          <Text dimColor> │ </Text>
          <Text color="green">{ICONS.plug} </Text>
          <Text color="green">
            {truncate(attachedTitle, Math.max(10, columns - 65))}
          </Text>
        </>
      ) : null}
    </Box>
  );
}
