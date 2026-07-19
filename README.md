# Nimbus

An open-source, cross-platform API client — a Postman/Bruno alternative built with **Tauri (Rust)** and **React/TypeScript**.

- **Runs anywhere**: Linux, macOS, Windows — one codebase, native binaries per OS via Tauri.
- **File-based collections**: requests and environments are plain text files on disk (`.nreq` / `.nenv`), so a collection is just a folder you can put in git, diff, and PR like code. No account, no cloud sync required.
- **Requests run natively**: HTTP calls are executed in Rust (via `reqwest`), not from the webview — this avoids the browser CORS restrictions that would otherwise block calls to arbitrary APIs.

## Project layout

```
nimbus/
├── src/                  # React/TypeScript frontend
│   ├── components/       # Sidebar, tabs, request builder, response viewer, env editor
│   ├── lib/
│   │   ├── types.ts       # Domain types (NimbusRequest, NimbusEnvironment, ...)
│   │   ├── bruFormat.ts    # Parser/serializer for the .nreq / .nenv text format
│   │   ├── store.ts        # Zustand app state (workspace, tabs, tree, environments)
│   │   └── tauriApi.ts     # Wrapper around Tauri `invoke` calls
└── src-tauri/            # Rust backend
    └── src/
        ├── http.rs         # Executes requests with reqwest (native, no CORS issues)
        ├── fsops.rs        # Reads/writes collection files, builds the sidebar tree
        └── lib.rs          # Wires up Tauri commands
```

## The file format

Every request is a plain text file, `Request Name.nreq`, e.g.:

```
meta {
  name: List Users
}

get {
  url: {{baseUrl}}/users
}

headers {
  Accept: application/json
}

body:json {
  {
    "example": true
  }
}
```

Folders are collections/sub-folders. Environments live in an `environments/` folder at the workspace
root as `.nenv` files (`vars { key: value }`). Variables are referenced anywhere with `{{variableName}}`.
This is intentionally close to Bruno's `.bru` format — readable, git-friendly, and easy to diff in a PR.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain, via `rustup`)
- Platform build tools for Tauri — see the [official prerequisites guide](https://v2.tauri.app/start/prerequisites/):
  - **Linux**: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `build-essential`, `librsvg2-dev` (exact package names vary by distro)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Microsoft Visual Studio C++ Build Tools + WebView2 (preinstalled on Windows 11 / most Windows 10 updates)

## Getting started

```bash
npm install

# run in development (hot reload for the frontend, native Rust backend)
npm run tauri dev
```

The app icon set is already generated and committed under `src-tauri/icons/`. To
replace it, drop a square source PNG (1024×1024 recommended) into the project root
and run `npx tauri icon <your-source.png>` — this regenerates the full icon set.

## Building installers

```bash
npm run tauri build
```

This produces a native installer/bundle for whichever OS you run it on:
- **Linux**: `.deb`, `.rpm`, and/or `.AppImage` in `src-tauri/target/release/bundle/`
- **macOS**: `.app` and `.dmg`
- **Windows**: `.msi` and `.exe` (NSIS)

To ship for all three platforms you build on (or CI-run on) each OS — Tauri doesn't cross-compile GUI
bundles from a single machine. A GitHub Actions matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`)
running `npm run tauri build` on each is the standard approach; `tauri-apps/tauri-action` is a ready-made
GitHub Action for this if you want CI/CD out of the box.

## Try it immediately

Launch the app and click **Open Workspace**, then select any folder on disk to use as your
collection. Create requests and environments with the sidebar buttons, hit **Send**, and the
response appears on the right. Because collections are just plain-text files, you can commit the
folder to git and share it like code.

## Current MVP scope

- Collections as folders, requests as `.nreq` files, environments as `.nenv` files
- Method, URL, query params, headers, body (JSON/text/XML/form), bearer/basic auth
- Environment variables with `{{var}}` interpolation, plus collection-level (`vars.nenv`) and
  global (`environments/globals.nenv`) variables, and per-request local variables
- Response viewer: status, timing, size, headers, pretty-printed JSON body
- Create/rename/delete requests and folders from the sidebar
- Import / export:
  - Import a **Postman v2.1** collection (`.json`) into the workspace
  - Import a **Bruno** collection (folder of `.bru` files) into the workspace
  - Export the open workspace back to a **Postman v2.1** collection
- TLS / client-certificate settings per request (custom CA, mTLS client cert/key, PFX password)
- Request notes via a `docs` block

## Roadmap ideas (not yet built)

- Pre-request / post-response scripting (JS, sandboxed)
- Request chaining & test assertions, with a runner + CI mode
- GraphQL and WebSocket support
- Cookie jar and HTTP proxy settings
- Multiple workspaces / recent workspaces list
- Diff view for response history

## Why Tauri over Electron

Tauri bundles use the OS's native webview instead of shipping Chromium, so binaries are typically
5-15MB instead of 80-120MB+, with a smaller memory footprint — a meaningful difference for a
utility app people keep open all day. The tradeoff is a slightly heavier one-time setup (a Rust
toolchain) and some platform-specific webview quirks to test against (WebKit on Linux/macOS,
WebView2 on Windows), which is why the Requirements section above is more involved than a typical
`npm install && npm start` JS project.

## License

MIT — see [LICENSE](./LICENSE).
