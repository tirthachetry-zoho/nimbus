use crate::models::{HttpRequestPayload, HttpResponsePayload};
use crate::scripting::{
    execute_script, execute_test_assertions, RequestData, ResponseData, ScriptContext,
};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::{Duration, Instant};

#[tauri::command]
pub async fn send_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    // Execute pre-request script if present
    let mut modified_headers = payload.headers.clone();
    let mut modified_url = payload.url.clone();
    let mut modified_body = payload.body.clone();

    if let Some(script) = &payload.pre_request_script {
        if !script.trim().is_empty() {
            let script_context = ScriptContext {
                request: RequestData {
                    method: payload.method.clone(),
                    url: payload.url.clone(),
                    headers: payload.headers.clone(),
                    body: payload.body.clone(),
                },
                environment: payload.environment_vars.clone(),
                globals: payload.global_vars.clone(),
                collection_vars: payload.collection_vars.clone(),
                local_vars: payload.local_vars.clone(),
                response: None,
            };

            match execute_script(script, &script_context) {
                Ok(result) => {
                    if !result.modified_headers.is_empty() {
                        modified_headers = result.modified_headers;
                    }
                    if let Some(url) = result.modified_url {
                        modified_url = url;
                    }
                    if let Some(body) = result.modified_body {
                        modified_body = Some(body);
                    }
                }
                Err(e) => {
                    return Err(format!("Pre-request script failed: {}", e));
                }
            }
        }
    }

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(30_000)))
        .danger_accept_invalid_certs(!payload.verify_ssl.unwrap_or(true));

    // Proxy settings
    if let Some(true) = payload.proxy_enabled {
        if let (Some(host), Some(port)) = (&payload.proxy_host, payload.proxy_port) {
            let proxy = reqwest::Proxy::all(format!("{}:{}", host, port))
                .map_err(|e| format!("invalid proxy config: {}", e))?;

            let proxy = if let (Some(username), Some(password)) =
                (&payload.proxy_username, &payload.proxy_password)
            {
                proxy.basic_auth(username, password)
            } else {
                proxy
            };

            builder = builder.proxy(proxy);
        }
    }

    // Custom CA certificate (PEM bundle)
    if let Some(ca) = &payload.ca_cert {
        if !ca.trim().is_empty() {
            let pem =
                std::fs::read(ca).map_err(|e| format!("failed to read CA cert '{ca}': {e}"))?;
            let cert = reqwest::Certificate::from_pem(&pem)
                .map_err(|e| format!("failed to parse CA cert '{ca}': {e}"))?;
            builder = builder.add_root_certificate(cert);
        }
    }

    // Client certificate (mutual TLS)
    if let Some(cert_path) = &payload.client_cert {
        if !cert_path.trim().is_empty() {
            let bytes = std::fs::read(cert_path)
                .map_err(|e| format!("failed to read client cert '{cert_path}': {e}"))?;
            let is_pem = String::from_utf8_lossy(&bytes).contains("-----BEGIN");
            let identity = if is_pem {
                // PEM: cert + key (key may be a separate file)
                let key = if let Some(key_path) = &payload.client_key {
                    if !key_path.trim().is_empty() {
                        std::fs::read(key_path)
                            .map_err(|e| format!("failed to read client key '{key_path}': {e}"))?
                    } else {
                        bytes.clone()
                    }
                } else {
                    bytes.clone()
                };
                reqwest::Identity::from_pkcs8_pem(&bytes, &key)
                    .map_err(|e| format!("failed to parse client cert (pem) '{cert_path}': {e}"))?
            } else {
                // PKCS12 / PFX
                let pass = payload.client_key_pass.clone().unwrap_or_default();
                reqwest::Identity::from_pkcs12_der(&bytes, &pass)
                    .map_err(|e| format!("failed to parse client cert (pfx) '{cert_path}': {e}"))?
            };
            builder = builder.identity(identity);
        }
    }

    let client = builder
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))?;

    let method_str = payload.method.to_uppercase();
    if !is_valid_method(&method_str) {
        return Err(format!("invalid HTTP method: {}", payload.method));
    }
    let method = reqwest::Method::from_str(&method_str)
        .map_err(|_| format!("invalid HTTP method: {}", payload.method))?;

    let mut req = client.request(method, &modified_url);

    let mut header_map = HeaderMap::new();
    for (k, v) in modified_headers.iter() {
        if k.trim().is_empty() {
            continue;
        }
        let name =
            HeaderName::from_str(k).map_err(|e| format!("invalid header name '{k}': {e}"))?;
        let value =
            HeaderValue::from_str(v).map_err(|e| format!("invalid header value for '{k}': {e}"))?;
        header_map.insert(name, value);
    }
    req = req.headers(header_map);

    if let Some(body) = modified_body {
        if payload.body_type.as_deref() != Some("none") && !body.is_empty() {
            req = req.body(body);
        }
    }

    let start = Instant::now();
    let resp = req
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();

    let mut headers: HashMap<String, String> = HashMap::new();
    for (k, v) in resp.headers().iter() {
        headers.insert(k.to_string(), v.to_str().unwrap_or("").to_string());
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("failed reading response body: {e}"))?;
    let size_bytes = bytes.len();
    let body = String::from_utf8_lossy(&bytes).to_string();
    let duration_ms = start.elapsed().as_millis();

    // Execute post-response script if present
    if let Some(script) = &payload.post_response_script {
        if !script.trim().is_empty() {
            let response_data = ResponseData {
                status: status.as_u16(),
                status_text: status_text.clone(),
                headers: headers.clone(),
                body: body.clone(),
                duration_ms,
            };

            let script_context = ScriptContext {
                request: RequestData {
                    method: payload.method.clone(),
                    url: payload.url.clone(),
                    headers: payload.headers.clone(),
                    body: payload.body.clone(),
                },
                environment: payload.environment_vars.clone(),
                globals: payload.global_vars.clone(),
                collection_vars: payload.collection_vars.clone(),
                local_vars: payload.local_vars.clone(),
                response: Some(response_data),
            };

            if let Err(e) = execute_script(script, &script_context) {
                return Err(format!("Post-response script failed: {}", e));
            }
        }
    }

    // Execute test assertions if present
    let test_results = if !payload.tests.is_empty() {
        let response_data = ResponseData {
            status: status.as_u16(),
            status_text: status_text.clone(),
            headers: headers.clone(),
            body: body.clone(),
            duration_ms,
        };
        execute_test_assertions(&payload.tests, &response_data)
    } else {
        Vec::new()
    };

    Ok(HttpResponsePayload {
        status: status.as_u16(),
        status_text,
        headers,
        body,
        duration_ms,
        size_bytes,
        test_results,
    })
}

/// Returns true if `m` (already upper-cased) is a supported HTTP method.
fn is_valid_method(m: &str) -> bool {
    matches!(
        m,
        "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "QUERY" | "GRAPHQL"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(method: &str, url: &str) -> HttpRequestPayload {
        HttpRequestPayload {
            method: method.to_string(),
            url: url.to_string(),
            headers: HashMap::new(),
            body: None,
            body_type: None,
            timeout_ms: Some(2000),
            verify_ssl: Some(true),
            ca_cert: None,
            client_cert: None,
            client_key: None,
            client_key_pass: None,
            pre_request_script: None,
            post_response_script: None,
            environment_vars: HashMap::new(),
            global_vars: HashMap::new(),
            collection_vars: HashMap::new(),
            local_vars: HashMap::new(),
            tests: vec![],
            proxy_enabled: None,
            proxy_host: None,
            proxy_port: None,
            proxy_username: None,
            proxy_password: None,
        }
    }

    #[tokio::test]
    async fn invalid_method_returns_error_without_network() {
        let result = send_request(payload("NOT_A_METHOD", "https://example.com")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid HTTP method"));
    }

    #[tokio::test]
    async fn connection_refused_to_closed_port_returns_error() {
        // Port 1 is not listening; this fails fast with connection refused and needs no
        // external network access.
        let result = send_request(payload("GET", "http://127.0.0.1:1/")).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("request failed"));
    }

    #[tokio::test]
    async fn malformed_url_returns_error() {
        let result = send_request(payload("GET", "this is not a url")).await;
        assert!(result.is_err());
    }

    #[test]
    fn is_valid_method_accepts_supported_methods_including_graphql() {
        for m in [
            "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "QUERY", "GRAPHQL",
        ] {
            assert!(is_valid_method(m), "expected {} to be valid", m);
        }
    }

    #[test]
    fn is_valid_method_rejects_unknown_methods() {
        assert!(!is_valid_method("NOT_A_METHOD"));
        assert!(!is_valid_method("graphql")); // must be upper-cased
        assert!(!is_valid_method(""));
    }
}
