use crate::models::FsNode;
use std::fs;
use std::path::Path;

const METHODS: [&str; 8] = ["get", "post", "put", "delete", "patch", "head", "options", "query"];

fn detect_method(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        for m in METHODS {
            if trimmed == format!("{m} {{") {
                return Some(m.to_uppercase());
            }
        }
    }
    None
}

fn build_tree(dir: &Path) -> Result<Vec<FsNode>, String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("failed to read dir {}: {e}", dir.display()))?
        .filter_map(|e| e.ok())
        .collect();

    // folders first, then files, both alphabetical
    entries.sort_by_key(|e| {
        let is_file = e.path().is_file();
        let name = e.file_name().to_string_lossy().to_lowercase();
        (is_file, name)
    });

    let mut nodes = Vec::new();
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = build_tree(&path)?;
            nodes.push(FsNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(children),
                method: None,
            });
        } else if name.ends_with(".nreq") {
            nodes.push(FsNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
                method: detect_method(&path),
            });
        } else if name.ends_with(".nenv") {
            nodes.push(FsNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
                method: None,
            });
        }
    }

    Ok(nodes)
}

#[tauri::command]
pub fn list_tree(root: String) -> Result<Vec<FsNode>, String> {
    let path = Path::new(&root);
    if !path.exists() {
        return Err(format!("path does not exist: {root}"));
    }
    build_tree(path)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("failed to read {path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create parent dirs: {e}"))?;
    }
    fs::write(&path, contents).map_err(|e| format!("failed to write {path}: {e}"))
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("failed to create dir {path}: {e}"))
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| format!("failed to rename {from} -> {to}: {e}"))
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("failed to delete dir {path}: {e}"))
    } else {
        fs::remove_file(p).map_err(|e| format!("failed to delete file {path}: {e}"))
    }
}

/// Parses a `vars { ... }` block out of a `.nenv`/`.nreq` file, returning key/value pairs.
fn parse_vars_block(content: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let normalized = content.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        if line.starts_with("vars") && line.contains('{') {
            let mut depth = 0i32;
            i += 1;
            while i < lines.len() {
                let l = lines[i];
                depth += (l.matches('{').count() as i32) - (l.matches('}').count() as i32);
                if depth <= 0 {
                    break;
                }
                let trimmed = l.trim();
                if !trimmed.is_empty() {
                    if let Some(idx) = trimmed.find(':') {
                        let key = trimmed[..idx].trim().to_string();
                        let value = trimmed[idx + 1..].trim().to_string();
                        if !key.is_empty() {
                            out.push((key, value));
                        }
                    }
                }
                i += 1;
            }
        }
        i += 1;
    }
    out
}

/// Collects collection (folder-level) variables for a request by walking up from the
/// request's directory to the filesystem root, reading any `vars.nenv` file found in
/// each ancestor folder. Closer folders take precedence (first match wins).
#[tauri::command]
pub fn collection_vars(request_path: String) -> Result<Vec<(String, String)>, String> {
    let mut vars: Vec<(String, String)> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut current = Path::new(&request_path)
        .parent()
        .map(|p| p.to_path_buf());

    while let Some(dir) = current {
        let vpath = dir.join("vars.nenv");
        if vpath.is_file() {
            if let Ok(content) = fs::read_to_string(&vpath) {
                for (k, v) in parse_vars_block(&content) {
                    if seen.insert(k.clone()) {
                        vars.push((k, v));
                    }
                }
            }
        }
        current = dir.parent().map(|p| p.to_path_buf());
    }
    Ok(vars)
}