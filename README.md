# Cubby

Cubby is an unofficial community Spindle extension for Lumiverse that groups drawer tabs behind compact sidebar folder tabs.

## v0.2.0 — polish pass

- Reworked Cubby launcher into a calmer responsive card grid.
- Uses host/extension SVG icons when available, with built-in fallbacks instead of giant initial-letter placeholders.
- Removed raw extension owner UUIDs from normal UI.
- Cleaned up manager cards and picker rows, including selected-state treatment and selected-first sorting.
- Existing Cubbies now live in their own non-searchable, non-selectable section in the picker. Nested Cubbies remain intentionally unsupported.
- Hardened drawer-surface filtering so Cubby's own synthetic folder tabs cannot appear as member candidates.


## Features

- Create, rename, edit, and delete one-level Cubby groups.
- Discover current built-in and extension-owned drawer tabs through the host surface catalog.
- Put each drawer tab in at most one Cubby.
- Open the original tab from a responsive launcher grid; Cubby does not clone or reparent its UI.
- Hide grouped child buttons from the sidebar while leaving their real drawer tabs invocable.
- Keep unavailable extension tabs as dormant assignments so they return when the extension comes back.
- Add a contextual `← Cubby name` action to the drawer header while a grouped child is open.
- Manage Cubby from Settings → Extensions through the standard `settings_extensions` mount.
- Persist configuration per user through a tiny backend using `spindle.userStorage`.
- No gated permissions.

## Scope cage

v0.2 deliberately does **not** implement nesting, drag-and-drop ordering, smart folders, recent tabs, badges, or a theme editor.

## Compatibility note

The actual drawer navigation is first-class Spindle: discovery uses `ctx.host.surfaces`, folders use `registerDrawerTab()`, and child tiles invoke the original `drawer_tab` surface.

The only presentation shim is hiding the original sidebar buttons. Current Lumiverse staging emits stable Spindle markers for each drawer button (`data-spindle-mount="drawer_tab"` + `data-spindle-scope="drawer-tab:<id>"`), so Cubby targets those markers rather than hashed CSS module classes.

Cubby's settings integration deliberately follows the working Prompt Viewer pattern: mount UI into `settings_extensions`, and use backend `userStorage` for persistence instead of the frontend private settings bridge.

## Build

```bash
bun install
bun run build
```

The build produces both `dist/backend.js` and `dist/frontend.js`.

## Before publishing

Replace the placeholder `github` and `homepage` URLs in `spindle.json` with the real public repository URL.

Cubby is independent and unofficial. It is not affiliated with or endorsed by Lumiverse.

## Changelog

### v0.1.3

- Replace the synthetic settings-tab registration with the proven `ctx.ui.mount('settings_extensions')` integration.
- Replace `ctx.settings` persistence with backend per-user `spindle.userStorage`.
- Remove async frontend setup/defer-ready persistence work that could hit `SETTINGS_BRIDGE_DISPOSED`.
- Add `dist/backend.js` and a two-target build script.
- Keep a drawer-manager fallback only if the settings mount itself is unavailable.

### v0.1.2

- Kept Cubby's manager alive when frontend settings reads failed, exposing the underlying `SETTINGS_BRIDGE_DISPOSED` lifecycle problem instead of failing invisibly.

### v0.1.1

- Corrected the private settings key format used by the abandoned frontend-settings implementation.

### v0.1.0

- Initial Cubby prototype.
