import { useRef, useCallback, useEffect } from "react";
import type { Client } from "chrome-remote-interface";
import { connectToTarget, safeCloseClient } from "../cdp.ts";
import type { CdpTarget } from "../types.ts";
import type { RemoteObject, LogNode } from "../types/log.ts";
import type { NetRecord } from "../types/network.ts";

export type CdpClientCallbacks = {
  onLog: (label: string, args: RemoteObject[], timestamp?: number) => void;
  onTextLog: (text: string) => void;
  onNetworkRequest: (rid: string, patch: Partial<NetRecord>) => void;
  onNetworkResponse: (rid: string, patch: Partial<NetRecord>) => void;
  onNetworkFinished: (rid: string, patch: Partial<NetRecord>) => void;
  onNetworkFailed: (rid: string, patch: Partial<NetRecord>) => void;
  onDisconnect: () => void;
};

export type CdpClientHookResult = {
  clientRef: React.RefObject<Client | null>;
  attach: (target: CdpTarget, host: string, port: number) => Promise<boolean>;
  detach: () => Promise<void>;
  evaluate: (expression: string) => Promise<{
    result?: RemoteObject;
    exceptionDetails?: { text?: string; exception?: RemoteObject };
  } | null>;
  getProperties: (objectId: string) => Promise<LogNode[]>;
  getResponseBody: (requestId: string) => Promise<{ body: string; base64Encoded: boolean }>;
  ping: () => void;
};

export function useCdpClient(
  callbacks: CdpClientCallbacks,
  opts: { network: boolean },
): CdpClientHookResult {
  const clientRef = useRef<Client | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const detach = useCallback(async () => {
    const c = clientRef.current;
    clientRef.current = null;
    await safeCloseClient(c);
  }, []);

  const attach = useCallback(
    async (target: CdpTarget, host: string, port: number): Promise<boolean> => {
      await detach();

      let c: Client;
      try {
        c = await connectToTarget(target, { host, port });
      } catch (err) {
        callbacksRef.current.onTextLog(String(err));
        return false;
      }

      clientRef.current = c;

      const anyClient = c as any;
      if (typeof anyClient.on === "function") {
        anyClient.on("disconnect", () => {
          callbacksRef.current.onDisconnect();
        });
      }

      const { Runtime, Log, Network, Console } = anyClient;
      try {
        await Promise.all([
          Runtime?.enable?.(),
          Console?.enable?.(),
          Log?.enable?.(),
          Network?.enable?.(),
        ]);
      } catch (err) {
        callbacksRef.current.onTextLog(`[enable] ${String(err)}`);
      }

      Runtime?.consoleAPICalled?.((p: any) => {
        const type = String(p?.type ?? "log");
        const args = Array.isArray(p?.args) ? (p.args as RemoteObject[]) : [];
        callbacksRef.current.onLog(`console.${type}`, args, p?.timestamp);
      });

      Runtime?.exceptionThrown?.((p: any) => {
        const details = p?.exceptionDetails;
        const text = details?.text ? String(details.text) : "exception";
        const args = details?.exception
          ? ([details.exception] as RemoteObject[])
          : [];
        callbacksRef.current.onLog(`exception ${text}`.trimEnd(), args, p?.timestamp);
      });

      Console?.messageAdded?.((p: any) => {
        const msg = p?.message ?? p;
        const source =
          typeof msg?.source === "string" ? String(msg.source) : "";
        if (source === "console-api") return;

        const level = String(msg?.level ?? "log");
        const text = String(msg?.text ?? "");
        const params = Array.isArray(msg?.parameters)
          ? (msg.parameters as RemoteObject[])
          : [];
        callbacksRef.current.onLog(
          `console.${level} ${text}`.trimEnd(),
          params,
          msg?.timestamp,
        );
      });

      Log?.entryAdded?.((p: any) => {
        const entry = p?.entry ?? p;
        const level = String(entry?.level ?? "info");
        const text = String(entry?.text ?? "");
        const url = entry?.url ? ` (${entry.url})` : "";
        callbacksRef.current.onTextLog(`log.${level} ${text}${url}`.trimEnd());
      });

      Network?.requestWillBeSent?.((p: any) => {
        const rid = String(p?.requestId ?? "");
        if (!rid) return;
        const req = p?.request;
        callbacksRef.current.onNetworkRequest(rid, {
          startTimestamp: p?.timestamp,
          method: String(req?.method ?? ""),
          url: String(req?.url ?? ""),
          requestHeaders: (req?.headers ?? {}) as Record<string, string>,
          postData: typeof req?.postData === "string" ? req.postData : undefined,
          initiator: p?.initiator?.url ? String(p.initiator.url) : undefined,
          type: p?.type ? String(p.type) : undefined,
        });
      });

      Network?.responseReceived?.((p: any) => {
        const rid = String(p?.requestId ?? "");
        if (!rid) return;
        const res = p?.response;
        callbacksRef.current.onNetworkResponse(rid, {
          status: typeof res?.status === "number" ? res.status : undefined,
          statusText: typeof res?.statusText === "string" ? res.statusText : undefined,
          mimeType: typeof res?.mimeType === "string" ? res.mimeType : undefined,
          protocol: typeof res?.protocol === "string" ? res.protocol : undefined,
          remoteIPAddress: typeof res?.remoteIPAddress === "string" ? res.remoteIPAddress : undefined,
          remotePort: typeof res?.remotePort === "number" ? res.remotePort : undefined,
          fromDiskCache: Boolean(res?.fromDiskCache),
          fromServiceWorker: Boolean(res?.fromServiceWorker),
          responseHeaders: (res?.headers ?? {}) as Record<string, string>,
        });
      });

      Network?.loadingFinished?.((p: any) => {
        const rid = String(p?.requestId ?? "");
        if (!rid) return;
        callbacksRef.current.onNetworkFinished(rid, {
          endTimestamp: p?.timestamp,
          encodedDataLength: typeof p?.encodedDataLength === "number" ? p.encodedDataLength : undefined,
        });
      });

      Network?.loadingFailed?.((p: any) => {
        const rid = String(p?.requestId ?? "");
        if (!rid) return;
        callbacksRef.current.onNetworkFailed(rid, {
          endTimestamp: p?.timestamp,
          errorText: typeof p?.errorText === "string" ? p.errorText : "failed",
          canceled: Boolean(p?.canceled),
        });
      });

      if (opts.network) {
        Network?.webSocketFrameSent?.((p: any) => {
          const payload = String(p?.response?.payloadData ?? "");
          const truncated = payload.length > 200 ? payload.slice(0, 200) + "…" : payload;
          callbacksRef.current.onTextLog(`ws.sent ${truncated}`.trimEnd());
        });

        Network?.webSocketFrameReceived?.((p: any) => {
          const payload = String(p?.response?.payloadData ?? "");
          const truncated = payload.length > 200 ? payload.slice(0, 200) + "…" : payload;
          callbacksRef.current.onTextLog(`ws.recv ${truncated}`.trimEnd());
        });
      }

      try {
        await Runtime?.evaluate?.({
          expression: `console.log("[termdev] attached", new Date().toISOString())`,
        });
      } catch {
        // ignore
      }

      return true;
    },
    [detach, opts.network],
  );

  const evaluate = useCallback(
    async (expression: string) => {
      const c = clientRef.current as any;
      const Runtime = c?.Runtime;
      if (!Runtime?.evaluate) return null;

      try {
        return await Runtime.evaluate({
          expression,
          awaitPromise: true,
          returnByValue: false,
        });
      } catch {
        return null;
      }
    },
    [],
  );

  const getProperties = useCallback(async (objectId: string): Promise<LogNode[]> => {
    const c = clientRef.current as any;
    const Runtime = c?.Runtime;
    if (!Runtime?.getProperties) {
      throw new Error("Runtime.getProperties is not available (not attached?)");
    }

    const res = await Runtime.getProperties({
      objectId,
      ownProperties: true,
      accessorPropertiesOnly: false,
      generatePreview: true,
    });

    const list: any[] = Array.isArray(res?.result) ? res.result : [];
    const items = list
      .filter((p: any) => p && typeof p.name === "string" && p.value)
      .map((p: any) => ({
        name: String(p.name),
        value: p.value as RemoteObject,
        enumerable: Boolean(p.enumerable),
      }));

    items.sort(
      (a, b) =>
        Number(b.enumerable) - Number(a.enumerable) ||
        a.name.localeCompare(b.name),
    );

    const LIMIT = 80;
    const sliced = items.slice(0, LIMIT);
    let nodeCounter = 0;
    const newNodeId = () => `prop_${++nodeCounter}_${Date.now()}`;

    const children: LogNode[] = sliced.map((it) => ({
      id: newNodeId(),
      kind: "prop" as const,
      name: it.name,
      value: it.value,
      expanded: false,
    }));

    if (items.length > LIMIT) {
      children.push({
        id: newNodeId(),
        kind: "meta" as const,
        text: `… (${items.length - LIMIT} more properties)`,
      });
    }

    return children;
  }, []);

  const getResponseBody = useCallback(
    async (requestId: string): Promise<{ body: string; base64Encoded: boolean }> => {
      const c = clientRef.current as any;
      const Network = c?.Network;
      if (!Network?.getResponseBody) {
        throw new Error("Network.getResponseBody is not available (not attached?)");
      }
      const res = await Network.getResponseBody({ requestId });
      return {
        body: String(res?.body ?? ""),
        base64Encoded: Boolean(res?.base64Encoded),
      };
    },
    [],
  );

  const ping = useCallback(() => {
    const c = clientRef.current as any;
    c?.Runtime?.evaluate?.({
      expression: `console.log("[termdev] ping", new Date().toISOString())`,
    });
  }, []);

  useEffect(() => {
    return () => {
      void detach();
    };
  }, [detach]);

  return {
    clientRef,
    attach,
    detach,
    evaluate,
    getProperties,
    getResponseBody,
    ping,
  };
}
