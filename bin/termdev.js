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
  // Try to find tsx in local node_modules first
  const localTsx = join(__dirname, "..", "node_modules", ".bin", "tsx");
  let tsxCmd;
  let tsxArgs;

  if (existsSync(localTsx)) {
    // Use local tsx
    tsxCmd = localTsx;
    tsxArgs = [tsFile, ...argv.slice(2)];
  } else if (which("tsx")) {
    // Use global tsx
    tsxCmd = "tsx";
    tsxArgs = [tsFile, ...argv.slice(2)];
  } else {
    // Try npx as last resort
    tsxCmd = "npx";
    tsxArgs = ["--yes", "tsx", tsFile, ...argv.slice(2)];
  }

  const proc = spawn(tsxCmd, tsxArgs, {
    stdio: "inherit",
    shell: tsxCmd === "npx", // Use shell for npx
  });

  proc.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  proc.on("error", (err) => {
    console.error("Error: Failed to run termdev.");
    console.error("tsx is required for Node.js runtime.");
    console.error("\nOptions:");
    console.error("  1. Install dependencies: npm install");
    console.error("  2. Install tsx globally: npm install -g tsx");
    console.error("  3. Use Bun instead: bun install && bun ./bin/termdev.ts");
    process.exit(1);
  });
}
