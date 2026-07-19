use crate::models::FsNode;
use std::fs;
use std::path::Path;

const METHODS: [&str; 8] = [
    "get", "post", "put", "delete", "patch", "head", "options", "query",
];

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
            // The opening brace is on the same line as `vars`, so start the
            // depth counter from the braces already present on this line.
            let mut depth = (line.matches('{').count() as i32) - (line.matches('}').count() as i32);
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
                        // A trailing '{' on the same line opens a nested block,
                        // so it is not part of the value.
                        let value = trimmed[idx + 1..]
                            .trim()
                            .trim_end_matches('{')
                            .trim()
                            .to_string();
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
    let mut current = Path::new(&request_path).parent().map(|p| p.to_path_buf());

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Creates a fresh, unique temporary directory for a test and returns its path.
    fn temp_dir(label: &str) -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "nimbus_test_{}_{}_{}",
            label,
            std::process::id(),
            n
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn detect_method_finds_first_method_block() {
        let dir = temp_dir("detect");
        let f = dir.join("req.nreq");
        write(&f, "meta {\n  name: X\n}\npost {\n  url: https://x\n}\n");
        assert_eq!(detect_method(&f), Some("POST".to_string()));

        let f2 = dir.join("nomethod.nreq");
        write(&f2, "meta {\n  name: Y\n}\n");
        assert_eq!(detect_method(&f2), None);
    }

    #[test]
    fn detect_method_returns_none_for_missing_file() {
        let dir = temp_dir("detect_missing");
        assert_eq!(detect_method(&dir.join("nope.nreq")), None);
    }

    #[test]
    fn parse_vars_block_extracts_key_value_pairs() {
        let content = "vars {\n  baseUrl: https://api.example.com\n  token: secret\n}\n";
        let vars = parse_vars_block(content);
        assert_eq!(
            vars,
            vec![
                ("baseUrl".to_string(), "https://api.example.com".to_string()),
                ("token".to_string(), "secret".to_string()),
            ]
        );
    }

    #[test]
    fn parse_vars_block_handles_nested_braces_and_blank_lines() {
        let content = "vars {\n  a: 1\n  b: 2 {\n    nested\n  }\n  c: 3\n}\nother { skip: me }\n";
        let vars = parse_vars_block(content);
        assert_eq!(
            vars,
            vec![
                ("a".to_string(), "1".to_string()),
                ("b".to_string(), "2".to_string()),
                ("c".to_string(), "3".to_string()),
            ]
        );
    }

    #[test]
    fn parse_vars_block_ignores_lines_without_colon() {
        let content = "vars {\n  justtext\n  key: value\n}\n";
        let vars = parse_vars_block(content);
        assert_eq!(vars, vec![("key".to_string(), "value".to_string())]);
    }

    #[test]
    fn list_tree_returns_error_for_missing_path() {
        let dir = temp_dir("list_missing");
        let result = list_tree(dir.join("does_not_exist").to_string_lossy().to_string());
        assert!(result.is_err());
    }

    #[test]
    fn list_tree_builds_sorted_tree_with_folders_first() {
        let dir = temp_dir("list");
        write(&dir.join("zeta.nreq"), "get { url: x }");
        write(&dir.join("alpha.nreq"), "get { url: x }");
        fs::create_dir_all(dir.join("FolderB")).unwrap();
        fs::create_dir_all(dir.join("FolderA")).unwrap();
        write(&dir.join("FolderA").join("inner.nreq"), "get { url: x }");
        // hidden files are skipped
        write(&dir.join(".hidden.nreq"), "get { url: x }");

        let tree = list_tree(dir.to_string_lossy().to_string()).unwrap();
        // folders first, then files (alphabetical, case-insensitive)
        assert_eq!(tree.len(), 4);
        assert!(tree[0].is_dir);
        assert_eq!(tree[0].name, "FolderA");
        assert!(tree[1].is_dir);
        assert_eq!(tree[1].name, "FolderB");
        assert!(!tree[2].is_dir);
        assert_eq!(tree[2].name, "alpha.nreq");
        assert!(!tree[3].is_dir);
        assert_eq!(tree[3].name, "zeta.nreq");

        // nested children present and hidden skipped
        let folder_a = tree.iter().find(|n| n.name == "FolderA").unwrap();
        assert_eq!(folder_a.children.as_ref().unwrap().len(), 1);
        assert_eq!(folder_a.children.as_ref().unwrap()[0].name, "inner.nreq");
        assert!(!tree.iter().any(|n| n.name.starts_with('.')));
    }

    #[test]
    fn list_tree_detects_method_for_request_files() {
        let dir = temp_dir("list_method");
        write(&dir.join("create.nreq"), "post {\n  url: https://x\n}\n");
        let tree = list_tree(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(tree[0].method, Some("POST".to_string()));
    }

    #[test]
    fn read_and_write_text_file_round_trip() {
        let dir = temp_dir("rw");
        let p = dir.join("a.txt");
        assert!(write_text_file(p.to_string_lossy().to_string(), "hello".into()).is_ok());
        let content = read_text_file(p.to_string_lossy().to_string()).unwrap();
        assert_eq!(content, "hello");
    }

    #[test]
    fn write_text_file_creates_parent_directories() {
        let dir = temp_dir("rw_parents");
        let p = dir.join("deep").join("nested").join("a.txt");
        assert!(write_text_file(p.to_string_lossy().to_string(), "x".into()).is_ok());
        assert!(p.is_file());
    }

    #[test]
    fn create_directory_and_rename_and_delete() {
        let dir = temp_dir("crud");
        let sub = dir.join("sub");
        assert!(create_directory(sub.to_string_lossy().to_string()).is_ok());
        assert!(sub.is_dir());

        let renamed = dir.join("renamed");
        assert!(rename_path(
            sub.to_string_lossy().to_string(),
            renamed.to_string_lossy().to_string()
        )
        .is_ok());
        assert!(renamed.is_dir());
        assert!(!sub.exists());

        assert!(delete_path(renamed.to_string_lossy().to_string()).is_ok());
        assert!(!renamed.exists());
    }

    #[test]
    fn delete_path_removes_files_and_dirs() {
        let dir = temp_dir("delete");
        let f = dir.join("a.txt");
        write(&f, "x");
        assert!(delete_path(f.to_string_lossy().to_string()).is_ok());
        assert!(!f.exists());

        let d = dir.join("d");
        fs::create_dir_all(&d).unwrap();
        assert!(delete_path(d.to_string_lossy().to_string()).is_ok());
        assert!(!d.exists());
    }

    #[test]
    fn collection_vars_walks_up_and_respects_precedence() {
        let dir = temp_dir("collvars");
        // root vars.nenv
        write(
            &dir.join("vars.nenv"),
            "vars {\n  base: root\n  shared: fromRoot\n}\n",
        );
        // sub folder vars.nenv overrides `shared`
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        write(
            &sub.join("vars.nenv"),
            "vars {\n  shared: fromSub\n  extra: yes\n}\n",
        );
        let req = sub.join("req.nreq");
        write(&req, "get { url: x }");

        let vars = collection_vars(req.to_string_lossy().to_string()).unwrap();
        let map: std::collections::HashMap<_, _> = vars.into_iter().collect();
        // closer folder wins for `shared`
        assert_eq!(map.get("shared").map(String::as_str), Some("fromSub"));
        // root-only var still present
        assert_eq!(map.get("base").map(String::as_str), Some("root"));
        // sub-only var present
        assert_eq!(map.get("extra").map(String::as_str), Some("yes"));
    }

    #[test]
    fn collection_vars_returns_empty_when_no_vars_files() {
        let dir = temp_dir("collvars_empty");
        let req = dir.join("req.nreq");
        write(&req, "get { url: x }");
        assert!(collection_vars(req.to_string_lossy().to_string())
            .unwrap()
            .is_empty());
    }
}
