export type CdpTarget = {
  id: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

export type TransportOptions = {
  host: string;
  port: number;
};

export type { RemoteObject, LogNodeKind, NetNodeInfo, LogNode, FlatLogLine } from "./types/log.ts";
export type { NetRecord } from "./types/network.ts";
