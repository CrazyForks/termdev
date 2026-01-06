import { useCallback } from "react";

export function useClipboard() {
  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.replace(/\s+$/g, "") + "\n";
    try {
      const { spawn } = await import("child_process");
      type ChildProcess = Awaited<ReturnType<typeof spawn>>;

      const runClipboard = (args: string[]): Promise<boolean> => {
        return new Promise((resolve) => {
          const cmd = args[0];
          if (!cmd) {
            resolve(false);
            return;
          }

          const proc = spawn(cmd, args.slice(1), {
            stdio: ["pipe", "ignore", "ignore"],
          }) as ChildProcess & { stdin: NodeJS.WritableStream };

          if (proc.stdin) {
            proc.stdin.write(trimmed);
            proc.stdin.end();
          }

          proc.on("close", (code: number | null) => {
            resolve(code === 0);
          });

          proc.on("error", () => {
            resolve(false);
          });
        });
      };

      if (process.platform === "darwin") {
        const result = await runClipboard(["pbcopy"]);
        if (result) return true;
      }

      const wlResult = await runClipboard(["wl-copy"]);
      if (wlResult) return true;

      const xclipResult = await runClipboard([
        "xclip",
        "-selection",
        "clipboard",
      ]);
      if (xclipResult) return true;
    } catch {
      // ignore
    }
    return false;
  }, []);

  return { copyToClipboard };
}
