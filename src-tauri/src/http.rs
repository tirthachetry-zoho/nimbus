use crate::models::{HttpRequestPayload, HttpResponsePayload};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::{Duration, Instant};

#[tauri::command]
pub async fn send_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(30_000)))
        .danger_accept_invalid_certs(!payload.verify_ssl.unwrap_or(true));

    // Custom CA certificate (PEM bundle)
    if let Some(ca) = &payload.ca_cert {
        if !ca.trim().is_empty() {
            let pem = std::fs::read(ca).map_err(|e| format!("failed to read CA cert '{ca}': {e}"))?;
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

    let method = reqwest::Method::from_str(&payload.method.to_uppercase())
        .map_err(|_| format!("invalid HTTP method: {}", payload.method))?;

    let mut req = client.request(method, &payload.url);

    let mut header_map = HeaderMap::new();
    for (k, v) in payload.headers.iter() {
        if k.trim().is_empty() {
            continue;
        }
        let name = HeaderName::from_str(k).map_err(|e| format!("invalid header name '{k}': {e}"))?;
        let value = HeaderValue::from_str(v).map_err(|e| format!("invalid header value for '{k}': {e}"))?;
        header_map.insert(name, value);
    }
    req = req.headers(header_map);

    if let Some(body) = payload.body.clone() {
        if payload.body_type.as_deref() != Some("none") && !body.is_empty() {
            req = req.body(body);
        }
    }

    let start = Instant::now();
    let resp = req.send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = resp.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();

    let mut headers: HashMap<String, String> = HashMap::new();
    for (k, v) in resp.headers().iter() {
        headers.insert(k.to_string(), v.to_str().unwrap_or("").to_string());
    }

    let bytes = resp.bytes().await.map_err(|e| format!("failed reading response body: {e}"))?;
    let size_bytes = bytes.len();
    let body = String::from_utf8_lossy(&bytes).to_string();
    let duration_ms = start.elapsed().as_millis();

    Ok(HttpResponsePayload {
        status: status.as_u16(),
        status_text,
        headers,
        body,
        duration_ms,
        size_bytes,
    })
}
