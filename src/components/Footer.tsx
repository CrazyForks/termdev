import React from "react";
import { Box, Text } from "ink";
import { ICONS } from "../utils/constants.ts";
import { truncate } from "../utils/tree.ts";

type FooterProps = {
  connected: boolean;
  status: string;
  columns: number;
};

export function Footer({ connected, status, columns }: FooterProps) {
  return (
    <Box>
      <Text backgroundColor="gray" color="black">
        {" "}
        <Text color={connected ? "green" : "yellow"}>
          {connected ? ICONS.connected : ICONS.disconnected}
        </Text>{" "}
      </Text>
      <Text backgroundColor="gray" color="black">
        {truncate(status, Math.max(10, columns - 60))}
      </Text>
      <Text backgroundColor="gray" color="black">
        {" "}
        │{" "}
      </Text>
      <Text backgroundColor="gray" color="blue" bold>
        tab
      </Text>
      <Text backgroundColor="gray" color="black">
        {" "}
        focus{" "}
      </Text>
      <Text backgroundColor="gray" color="blue" bold>
        r
      </Text>
      <Text backgroundColor="gray" color="black">
        {" "}
        refresh{" "}
      </Text>
      <Text backgroundColor="gray" color="blue" bold>
        c
      </Text>
      <Text backgroundColor="gray" color="black">
        {" "}
        clear{" "}
      </Text>
      <Text backgroundColor="gray" color="blue" bold>
        q
      </Text>
      <Text backgroundColor="gray" color="black">
        {" "}
        quit{" "}
      </Text>
      <Text backgroundColor="gray" color="black">
        {" ".repeat(Math.max(0, columns - 80))}
      </Text>
    </Box>
  );
}
