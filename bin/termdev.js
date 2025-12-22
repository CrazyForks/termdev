#!/usr/bin/env node

import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tsFile = join(__dirname, "termdev.ts");

// Support both Bun and Node.js runtime
const argv = typeof Bun !== "undefined" ? Bun.argv : process.argv;

// Helper to check if command exists
function which(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Try Bun first, then tsx
if (typeof Bun !== "undefined") {
  // Use Bun directly
  await Bun.spawn(["bun", tsFile, ...argv.slice(2)], {
    stdio: "inherit",
  }).exited;
} else {
  // Try to find tsx: first check local, then global, then use npx
  const localTsx = join(__dirname, "..", "node_modules", ".bin", "tsx");
  let tsxCmd;
  let tsxArgs;

  if (existsSync(localTsx)) {
    // Use local tsx (development)
    tsxCmd = localTsx;
    tsxArgs = [tsFile, ...argv.slice(2)];
  } else if (which("tsx")) {
    // Use tsx from PATH (global install)
    tsxCmd = "tsx";
    tsxArgs = [tsFile, ...argv.slice(2)];
  } else {
    // Use npx to find tsx (works for both local and global installs)
    // npx will look in node_modules (local or global) without downloading
    tsxCmd = "npx";
    tsxArgs = ["tsx", tsFile, ...argv.slice(2)];
  }

  const proc = spawn(tsxCmd, tsxArgs, {
    stdio: "inherit",
    shell: tsxCmd === "npx",
  });

  proc.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  proc.on("error", (err) => {
    console.error("Error: Failed to run termdev.");
    console.error("tsx is required for Node.js runtime.");
    console.error("\nPlease ensure:");
    console.error(
      "  1. Dependencies are installed: npm install -g @taotao7/termdev"
    );
    console.error("  2. Or use Bun: bun install -g @taotao7/termdev");
    process.exit(1);
  });
}
