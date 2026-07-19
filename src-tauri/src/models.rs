use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FsNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FsNode>>,
    pub method: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub body_type: Option<String>, // "json" | "text" | "xml" | "form" | "none"
    #[serde(default)]
    pub timeout_ms: Option<u64>,

    // TLS / client-certificate settings (all optional; when omitted, system defaults are used)
    #[serde(default)]
    pub verify_ssl: Option<bool>, // default true
    #[serde(default)]
    pub ca_cert: Option<String>, // path to PEM CA bundle
    #[serde(default)]
    pub client_cert: Option<String>, // path to PEM cert or PKCS12 (.pfx/.p12)
    #[serde(default)]
    pub client_key: Option<String>, // path to PEM private key (when cert is PEM without key)
    #[serde(default)]
    pub client_key_pass: Option<String>, // password for encrypted PKCS12
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u128,
    pub size_bytes: usize,
}
