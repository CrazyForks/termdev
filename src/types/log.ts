export type RemoteObject = {
  type?: string;
  subtype?: string;
  className?: string;
  description?: string;
  unserializableValue?: string;
  value?: unknown;
  objectId?: string;
  preview?: unknown;
};

export type LogNodeKind = "text" | "entry" | "arg" | "prop" | "meta";

export type NetNodeInfo = {
  requestId: string;
  role: "request" | "headers" | "response" | "body";
  which?: "request" | "response";
};

export type LogNode = {
  id: string;
  kind: LogNodeKind;
  timestamp?: number;
  label?: string;
  text?: string;
  args?: RemoteObject[];
  object?: RemoteObject;
  name?: string;
  value?: RemoteObject;
  expanded?: boolean;
  loading?: boolean;
  children?: LogNode[];
  net?: NetNodeInfo;
};

export type FlatLogLine = {
  nodeId: string;
  parentId: string | null;
  indent: number;
  text: string;
  expandable: boolean;
  expanded: boolean;
};
