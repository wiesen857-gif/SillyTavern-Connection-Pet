# SillyTavern Connection Pet Implementation Plan

> Execution target: SillyTavern 1.16.0 + Tavern Helper 4.9.2.

**Goal:** Build an installable third-party extension that switches Custom OpenAI-compatible API profiles independently from prompt presets, and lets a draggable pet switch presets before toggling only allowlisted prompt entries.

**Architecture:** Keep persisted data, pure preset transformations, host integration, and UI rendering separate. Use SillyTavern extension settings for non-secret profile data, native SillyTavern Secrets for keys, and Tavern Helper's documented preset API for prompt entry operations.

**Tech stack:** Browser-native ES modules, HTML/CSS, Node.js built-in test runner.

---

### Task 1: Settings model and preset operations

**Files:** `src/settings.js`, `src/preset-operations.js`, `tests/settings.test.mjs`, `tests/preset-operations.test.mjs`

- Write failing tests for normalization, secret exclusion, allowlist behavior, operation ordering, stale IDs, and untouched prompts.
- Implement only the pure logic needed to pass them.

### Task 2: SillyTavern/Tavern Helper adapter

**Files:** `src/host-adapter.js`, `tests/host-adapter.test.mjs`

- Write failing tests for Custom-only profile application, native Secret ID rotation, command safety, and preset capability checks.
- Implement version-pinned integration with explicit capability errors.

### Task 3: Extension settings drawer

**Files:** `settings.html`, `src/settings-panel.js`, `style.css`

- Add a standard foldable Extensions drawer entry.
- Implement profile CRUD and native-secret creation without persisting plaintext keys.
- Implement preset discovery and allowlist management.

### Task 4: Draggable pet and compact popup

**Files:** `src/pet-widget.js`, `assets/pet-icon-switch.png`, `style.css`

- Add the selected minimal pink configuration-switching icon.
- Persist safe viewport position and support pointer drag/click distinction.
- Add API and preset-entry tabs with immediate actions and clear status feedback.

### Task 5: Bootstrap, documentation, and verification

**Files:** `index.js`, `manifest.json`, `README.md`, `package.json`, `tests/fixtures/mock-host.html`

- Bootstrap after SillyTavern readiness and show actionable dependency errors.
- Document installation, security boundaries, supported versions, and use.
- Run unit tests, syntax/static checks, and a browser visual smoke test at desktop and narrow widths.
- Commit and push to the supplied GitHub repository when credentials permit.
