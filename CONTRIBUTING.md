# Contributing to Nimbus

First off — thank you for considering contributing to **Nimbus**! 💙 It's an open-source, cross-platform API client (a Postman/Bruno alternative) built with **Tauri (Rust)** and **React/TypeScript**. Every contribution, big or small, helps shape the project.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [How can I contribute?](#how-can-i-contribute)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Coding guidelines](#coding-guidelines)
- [Running tests](#running-tests)
- [Submitting a pull request](#submitting-a-pull-request)
- [Good first issues / roadmap](#good-first-issues--roadmap)

## Code of Conduct

Be kind and respectful. We want Nimbus to be a welcoming project for everyone, regardless of experience level. Harassment or abusive behavior will not be tolerated.

## How can I contribute?

There are many ways to help, even if you don't write Rust or React:

- **Report bugs** — open an issue with steps to reproduce, expected vs. actual behavior, and your OS.
- **Suggest features** — open an issue describing the use case.
- **Improve docs** — README, this file, code comments, or in-app copy.
- **Write code** — fix bugs, implement features, add tests.
- **Review PRs** — feedback from users and devs is incredibly valuable.

If you're unsure where to start, check the [roadmap](#good-first-issues--roadmap) below or look for issues labeled `good first issue`.

## Development setup

### Prerequisites

- **Node.js** 18+
- **Rust** stable toolchain (via [rustup](https://rustup.rs/))
- Platform build tools for Tauri — see the [official prerequisites guide](https://v2.tauri.app/start/prerequisites/):
  - **Linux**: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `build-essential`, `librsvg2-dev`
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Microsoft Visual Studio C++ Build Tools + WebView2

### Getting started

```bash
# 1. Fork and clone your fork
git clone https://github.com/<your-username>/nimbus.git
cd nimbus

# 2. Install frontend dependencies
npm install

# 3. Run in development (hot reload for the frontend, native Rust backend)
npm run tauri dev
```

The app should launch. Click **Open Workspace**, pick any folder to use as a collection, and you're ready to experiment.

## Project structure

```
nimbus/
├── src/                  # React/TypeScript frontend
│   ├── components/       # Sidebar, tabs, request builder, response viewer, env editor
│   ├── lib/
│   │   ├── types.ts       # Domain types (NimbusRequest, NimbusEnvironment, ...)
│   │   ├── bruFormat.ts    # Parser/serializer for the .nreq / .nenv text format
│   │   ├── store.ts        # Zustand app state (workspace, tabs, tree, environments)
│   │   └── tauriApi.ts     # Wrapper around Tauri `invoke` calls
│   └── styles/           # Tailwind / global CSS
└── src-tauri/            # Rust backend
    └── src/
        ├── http.rs         # Executes requests with reqwest (native, no CORS issues)
        ├── fsops.rs        # Reads/writes collection files, builds the sidebar tree
        ├── scripting.rs    # Pre/post-request scripting (QuickJS) & test assertions
        ├── models.rs       # Rust domain models
        └── lib.rs          # Wires up Tauri commands
```

**Mental model:** the frontend talks to the Rust backend exclusively through Tauri `invoke` commands (see `src/lib/tauriApi.ts` and `src-tauri/src/lib.rs`). HTTP requests and file I/O happen in Rust, never in the webview.

## Coding guidelines

- **Frontend**: TypeScript + React 18, styled with Tailwind. Keep components small and focused; share state through the Zustand store (`src/lib/store.ts`).
- **Backend**: Rust, idiomatic and documented. Add `#[tauri::command]` functions in `lib.rs` and keep logic in the appropriate module (`http.rs`, `fsops.rs`, `scripting.rs`).
- **Formatting**: run `cargo fmt` for Rust and let your editor's Prettier/ESLint handle the frontend.
- **Commits**: use clear, imperative commit messages (e.g. `fix: handle empty environment file`, `feat: add WebSocket support`).
- **File format**: the `.nreq` / `.nenv` text format is intentionally close to Bruno's `.bru`. Keep it human-readable and git-friendly.

## Running tests

```bash
# Frontend / lib unit tests (Vitest)
npm test

# Watch mode
npm run test:watch

# Coverage
npm run coverage
```

Rust changes are validated by `cargo build` / `cargo clippy` as part of the normal build. Please make sure `npm test` passes before opening a PR.

## Submitting a pull request

1. Fork the repo and create a branch from `main` (`git checkout -b feat/my-change`).
2. Make your changes, including tests where it makes sense.
3. Run `npm test` and ensure it passes.
4. Commit with a clear message and push to your fork.
5. Open a PR against `tirthachetry-zoho/nimbus:main`.
6. Describe **what** changed and **why**, and link any related issue.

A maintainer will review your PR, request changes if needed, and merge once it's green. Don't be discouraged by review feedback — it's how we keep the codebase healthy.

## Good first issues / roadmap

These are areas we'd love help with (great for first-time contributors):

- **Request chaining & collection runner** with a CI mode
- **WebSocket support**
- **Cookie jar** and persistence
- **Diff view** for response history
- **More importers/exporters** (Insomnia, cURL, OpenAPI)
- **Docs, onboarding tooltips, and sample collections**

If you'd like to tackle one of these, open an issue to claim it and we'll help you get oriented.

---

Questions? Open an issue or start a discussion. Thanks again for helping build Nimbus in the open! 🌟