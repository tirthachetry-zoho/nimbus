import { describe, it, expect } from "vitest";
import {
  emptyRequest,
  emptyEnvironment,
  parseRequestFile,
  serializeRequestFile,
  parseEnvFile,
  serializeEnvFile,
  newId,
} from "./bruFormat";

describe("emptyRequest", () => {
  it("creates a GET request with sensible defaults", () => {
    const r = emptyRequest("My Request");
    expect(r.name).toBe("My Request");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("");
    expect(r.headers).toEqual([]);
    expect(r.params).toEqual([]);
    expect(r.bodyType).toBe("none");
    expect(r.body).toBe("");
    expect(r.auth).toEqual({ mode: "none" });
    expect(r.localVars).toEqual([]);
    expect(r.tls).toEqual({
      verifySsl: true,
      caCert: "",
      clientCert: "",
      clientKey: "",
      clientKeyPass: "",
    });
  });

  it("defaults the name when omitted", () => {
    expect(emptyRequest().name).toBe("Untitled Request");
  });
});

describe("parseRequestFile", () => {
  it("parses a minimal request", () => {
    const content = `meta {
  name: List Users
}

get {
  url: https://api.example.com/users
}`;
    const r = parseRequestFile(content);
    expect(r.name).toBe("List Users");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://api.example.com/users");
  });

  it("parses all HTTP methods case-insensitively", () => {
    for (const m of ["post", "PUT", "Delete", "patch", "HEAD", "options", "query"]) {
      const r = parseRequestFile(`${m} {\n  url: x\n}`);
      expect(r.method).toBe(m.toUpperCase());
    }
  });

  it("parses headers and params with disabled rows", () => {
    const content = `get { url: x }
params:query {
  ~disabled: no
  page: 2
}
headers {
  Accept: application/json
  ~X-Old: y
}`;
    const r = parseRequestFile(content);
    expect(r.params).toEqual([
      { id: expect.any(String), key: "disabled", value: "no", enabled: false },
      { id: expect.any(String), key: "page", value: "2", enabled: true },
    ]);
    expect(r.headers).toEqual([
      { id: expect.any(String), key: "Accept", value: "application/json", enabled: true },
      { id: expect.any(String), key: "X-Old", value: "y", enabled: false },
    ]);
  });

  it("parses bearer and basic auth", () => {
    const bearer = parseRequestFile(`get { url: x }
auth {
  mode: bearer
}
auth:bearer {
  token: abc
}`);
    expect(bearer.auth).toEqual({ mode: "bearer", token: "abc" });

    const basic = parseRequestFile(`get { url: x }
auth {
  mode: basic
}
auth:basic {
  username: u
  password: p
}`);
    expect(basic.auth).toEqual({ mode: "basic", username: "u", password: "p" });
  });

  it("parses body of each type, preserving nested braces", () => {
    const json = parseRequestFile(`post { url: x }
body:json {
  {
    "nested": { "a": 1 }
  }
}`);
    expect(json.bodyType).toBe("json");
    expect(json.body).toContain('"nested"');

    for (const bt of ["text", "xml", "form"] as const) {
      const r = parseRequestFile(`post { url: x }\nbody:${bt} {\n  raw content\n}`);
      expect(r.bodyType).toBe(bt);
      expect(r.body).toBe("raw content");
    }
  });

  it("parses docs and local vars", () => {
    const r = parseRequestFile(`get { url: x }
vars:local {
  baseUrl: https://api.example.com
  ~off: 0
}
docs {
  Some notes
  on multiple lines
}`);
    expect(r.localVars).toEqual([
      { id: expect.any(String), key: "baseUrl", value: "https://api.example.com", enabled: true },
      { id: expect.any(String), key: "off", value: "0", enabled: false },
    ]);
    expect(r.docs).toBe("Some notes\non multiple lines");
  });

  it("parses TLS settings with overrides", () => {
    const r = parseRequestFile(`get { url: x }
tls {
  verifySsl: false
  caCert: /path/ca.pem
  clientCert: /path/c.pem
  clientKey: /path/k.pem
  clientKeyPass: secret
}`);
    expect(r.tls).toEqual({
      verifySsl: false,
      caCert: "/path/ca.pem",
      clientCert: "/path/c.pem",
      clientKey: "/path/k.pem",
      clientKeyPass: "secret",
    });
  });

  it("treats verifySsl: false only when explicitly false", () => {
    const r = parseRequestFile(`get { url: x }\ntls {\n  caCert: x\n}`);
    expect(r.tls.verifySsl).toBe(true);
    expect(r.tls.caCert).toBe("x");
  });

  it("handles CRLF line endings", () => {
    const r = parseRequestFile("get {\r\n  url: https://x\r\n}\r\nheaders {\r\n  A: b\r\n}");
    expect(r.url).toBe("https://x");
    expect(r.headers[0]).toMatchObject({ key: "A", value: "b" });
  });

  it("returns an empty request for blank content", () => {
    const r = parseRequestFile("");
    expect(r.method).toBe("GET");
    expect(r.name).toBe("Untitled Request");
  });
});

describe("serializeRequestFile", () => {
  it("round-trips a fully populated request", () => {
    const req = emptyRequest("Full");
    req.method = "POST";
    req.url = "https://api.example.com/users";
    req.params = [{ id: "1", key: "page", value: "1", enabled: true }];
    req.headers = [
      { id: "2", key: "Accept", value: "application/json", enabled: true },
      { id: "3", key: "X-Old", value: "y", enabled: false },
    ];
    req.auth = { mode: "bearer", token: "tkn" };
    req.bodyType = "json";
    req.body = '{ "a": 1 }';
    req.localVars = [{ id: "4", key: "baseUrl", value: "https://x", enabled: true }];
    req.tls = { verifySsl: false, caCert: "/c", clientCert: "", clientKey: "", clientKeyPass: "" };
    req.docs = "notes";

    const text = serializeRequestFile(req);
    const parsed = parseRequestFile(text);
    expect(parsed.name).toBe("Full");
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://api.example.com/users");
    expect(parsed.params).toEqual([{ id: expect.any(String), key: "page", value: "1", enabled: true }]);
    expect(parsed.headers).toEqual([
      { id: expect.any(String), key: "Accept", value: "application/json", enabled: true },
      { id: expect.any(String), key: "X-Old", value: "y", enabled: false },
    ]);
    expect(parsed.auth).toEqual(req.auth);
    expect(parsed.bodyType).toBe("json");
    expect(parsed.body).toBe('{ "a": 1 }');
    expect(parsed.localVars).toEqual([{ id: expect.any(String), key: "baseUrl", value: "https://x", enabled: true }]);
    expect(parsed.tls.verifySsl).toBe(false);
    expect(parsed.tls.caCert).toBe("/c");
    expect(parsed.docs).toBe("notes");
  });

  it("omits empty sections", () => {
    const text = serializeRequestFile(emptyRequest("Min"));
    expect(text).not.toContain("headers");
    expect(text).not.toContain("body:");
    expect(text).not.toContain("auth");
    expect(text).toContain("meta {");
    expect(text).toContain("get {");
  });

  it("serializes basic auth block", () => {
    const req = emptyRequest("B");
    req.auth = { mode: "basic", username: "u", password: "p" };
    const text = serializeRequestFile(req);
    expect(text).toContain("auth:basic {");
    expect(text).toContain("username: u");
    expect(text).toContain("password: p");
  });

  it("only serializes TLS when something is set", () => {
    const none = serializeRequestFile(emptyRequest("n"));
    expect(none).not.toContain("tls");
    const withKey = serializeRequestFile({
      ...emptyRequest("k"),
      tls: { verifySsl: true, caCert: "", clientCert: "", clientKey: "k.pem", clientKeyPass: "" },
    });
    expect(withKey).toContain("tls {");
    expect(withKey).toContain("clientKey: k.pem");
  });
});

describe("scripts and tests", () => {
  it("emptyRequest includes script and test fields", () => {
    const r = emptyRequest("S");
    expect(r.preRequestScript).toEqual({ enabled: false, source: "" });
    expect(r.postResponseScript).toEqual({ enabled: false, source: "" });
    expect(r.tests).toEqual([]);
  });

  it("parses GRAPHQL as a method", () => {
    const r = parseRequestFile("graphql {\n  url: https://api.example.com/graphql\n}");
    expect(r.method).toBe("GRAPHQL");
  });

  it("parses a graphql body", () => {
    const r = parseRequestFile(`post { url: x }
body:graphql {
  query { user { id } }
}`);
    expect(r.bodyType).toBe("graphql");
    expect(r.body).toBe("query { user { id } }");
  });

  it("parses pre-request and post-response scripts", () => {
    const content = `get { url: x }
script:pre-request {
  enabled: true
  console.log("before")
}
script:post-response {
  enabled: false
  console.log("after")
}`;
    const r = parseRequestFile(content);
    expect(r.preRequestScript).toEqual({ enabled: true, source: 'console.log("before")' });
    expect(r.postResponseScript).toEqual({ enabled: false, source: 'console.log("after")' });
  });

  it("parses test assertions", () => {
    const content = `get { url: x }
tests {
  response.status === 200: Status is 200
  ~response.body.includes("ok"): Body contains ok
}`;
    const r = parseRequestFile(content);
    expect(r.tests).toEqual([
      { id: expect.any(String), enabled: true, expression: "response.status === 200", description: "Status is 200" },
      { id: expect.any(String), enabled: false, expression: 'response.body.includes("ok")', description: "Body contains ok" },
    ]);
  });

  it("round-trips scripts and tests through serialize/parse", () => {
    const req = emptyRequest("Full");
    req.method = "POST";
    req.url = "https://api.example.com/graphql";
    req.preRequestScript = { enabled: true, source: "log('pre')" };
    req.postResponseScript = { enabled: true, source: "log('post')" };
    req.tests = [
      { id: "t1", enabled: true, expression: "response.status === 200", description: "ok status" },
      { id: "t2", enabled: false, expression: "false", description: "disabled" },
    ];

    const text = serializeRequestFile(req);
    const parsed = parseRequestFile(text);

    expect(parsed.method).toBe("POST");
    expect(parsed.preRequestScript).toEqual({ enabled: true, source: "log('pre')" });
    expect(parsed.postResponseScript).toEqual({ enabled: true, source: "log('post')" });
    expect(parsed.tests).toEqual([
      { id: expect.any(String), enabled: true, expression: "response.status === 200", description: "ok status" },
      { id: expect.any(String), enabled: false, expression: "false", description: "disabled" },
    ]);
  });

  it("omits script sections when empty", () => {
    const text = serializeRequestFile(emptyRequest("Min"));
    expect(text).not.toContain("script:pre-request");
    expect(text).not.toContain("script:post-response");
    expect(text).not.toContain("tests {");
  });
});

describe("environments", () => {
  it("emptyEnvironment uses the given name", () => {
    expect(emptyEnvironment("Dev").name).toBe("Dev");
    expect(emptyEnvironment("Dev").vars).toEqual([]);
  });

  it("parses and serializes env vars with disabled rows", () => {
    const text = `vars {
  baseUrl: https://api.example.com
  token: secret
  ~legacy: old
}`;
    const env = parseEnvFile(text, "fallback");
    expect(env.name).toBe("fallback");
    expect(env.vars).toEqual([
      { id: expect.any(String), key: "baseUrl", value: "https://api.example.com", enabled: true },
      { id: expect.any(String), key: "token", value: "secret", enabled: true },
      { id: expect.any(String), key: "legacy", value: "old", enabled: false },
    ]);
    const round = parseEnvFile(serializeEnvFile(env), "x");
    expect(round.vars).toEqual([
      { id: expect.any(String), key: "baseUrl", value: "https://api.example.com", enabled: true },
      { id: expect.any(String), key: "token", value: "secret", enabled: true },
      { id: expect.any(String), key: "legacy", value: "old", enabled: false },
    ]);
  });

  it("handles an empty env file", () => {
    const env = parseEnvFile("", "Empty");
    expect(env.name).toBe("Empty");
    expect(env.vars).toEqual([]);
  });
});

describe("newId", () => {
  it("returns a non-empty unique-ish string", () => {
    const a = newId();
    const b = newId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});