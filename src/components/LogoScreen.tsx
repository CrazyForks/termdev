import React from "react";
import { Box, Text, useInput } from "ink";
import gradient from "gradient-string";
import {
  LOGO_ART,
  LOGO_SUBTITLE,
  LOGO_HINT,
  RAINBOW_COLORS,
  SUBTITLE_GRADIENT_COLORS,
  HINT_GRADIENT_COLORS,
} from "../utils/constants.ts";

type LogoScreenProps = {
  onDismiss: () => void;
};

export function LogoScreen({ onDismiss }: LogoScreenProps) {
  useInput(() => {
    onDismiss();
  });

  const logoLines = LOGO_ART.trim().split("\n");

  const coloredLines = logoLines.map((line, i) => {
    const c1 = RAINBOW_COLORS[i % RAINBOW_COLORS.length]!;
    const c2 = RAINBOW_COLORS[(i + 1) % RAINBOW_COLORS.length]!;
    const c3 = RAINBOW_COLORS[(i + 2) % RAINBOW_COLORS.length]!;
    const lineGradient = gradient([c1, c2, c3]);
    return lineGradient(line);
  });

  const subtitleColored = gradient([...SUBTITLE_GRADIENT_COLORS])(LOGO_SUBTITLE);
  const hintColored = gradient([...HINT_GRADIENT_COLORS])(LOGO_HINT);

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      {coloredLines.map((line, i) => (
        <Text key={`logo-${i}`}>{line}</Text>
      ))}
      <Text> </Text>
      <Text>{subtitleColored}</Text>
      <Text> </Text>
      <Text>{hintColored}</Text>
    </Box>
  );
}
