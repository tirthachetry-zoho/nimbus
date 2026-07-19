export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "QUERY" | "GRAPHQL";

export type BodyType = "none" | "json" | "text" | "xml" | "form" | "graphql";

export type AuthMode = "none" | "bearer" | "basic";

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestAuth {
  mode: AuthMode;
  token?: string;
  username?: string;
  password?: string;
}

export interface TlsSettings {
  verifySsl: boolean;
  caCert: string;
  clientCert: string;
  clientKey: string;
  clientKeyPass: string;
}

export interface Script {
  enabled: boolean;
  source: string;
}

export interface TestAssertion {
  id: string;
  enabled: boolean;
  expression: string;
  description?: string;
}

export interface NimbusRequest {
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  bodyType: BodyType;
  body: string;
  auth: RequestAuth;
  docs?: string;
  localVars: KeyValue[];
  tls: TlsSettings;
  preRequestScript?: Script;
  postResponseScript?: Script;
  tests?: TestAssertion[];
  proxySettings?: ProxySettings;
}

export interface NimbusEnvironment {
  name: string;
  vars: KeyValue[];
}

export interface FsNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FsNode[] | null;
  method: string | null;
}

export interface OpenTab {
  path: string; // absolute file path, or "draft:<uuid>" for unsaved
  title: string;
  request: NimbusRequest;
  dirty: boolean;
  response: HttpResponse | null;
  sending: boolean;
  responseHistory: HttpResponse[];
}

export interface HttpResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
  size_bytes: number;
  error?: string;
  test_results?: TestResult[];
}

export interface TestResult {
  assertion_id: string;
  passed: boolean;
  error?: string;
}

export interface Cookie {
  domain: string;
  name: string;
  value: string;
  path: string;
  expires?: number;
  http_only: boolean;
  secure: boolean;
}

export interface ProxySettings {
  enabled: boolean;
  host: string;
  port: number;
  username?: string;
  password?: string;
}