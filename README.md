# Cubby

Cubby is an unofficial community Spindle extension for Lumiverse that groups drawer tabs behind compact sidebar folder tabs.

## v0.1.0

- Create, rename, edit, and delete one-level Cubby groups.
- Discover current built-in and extension-owned drawer tabs through the host surface catalog.
- Put each drawer tab in at most one Cubby.
- Open the original tab from a responsive launcher grid; Cubby does not clone or reparent its UI.
- Hide grouped child buttons from the sidebar while leaving their real drawer tabs invocable.
- Keep unavailable extension tabs as dormant assignments so they return when the extension comes back.
- Add a contextual `← Cubby name` action to the drawer header while a grouped child is open.
- Store configuration in extension settings. No backend and no gated permissions.
- Manage Cubby from a settings tab when the host supports extension settings tabs; older compatible hosts fall back to a drawer manager.

## Scope cage

v0.1 deliberately does **not** implement nesting, drag-and-drop ordering, smart folders, recent tabs, badges, or a theme editor.

## Compatibility note

The actual drawer navigation is first-class Spindle: discovery uses `ctx.host.surfaces`, folders use `registerDrawerTab()`, and child tiles invoke the original `drawer_tab` surface.

The only presentation shim is hiding the original sidebar buttons. Current Lumiverse staging emits stable Spindle markers for each drawer button (`data-spindle-mount="drawer_tab"` + `data-spindle-scope="drawer-tab:<id>"`), so Cubby targets those markers rather than hashed CSS module classes.

## Build

```bash
bun install
bun run build
```

Lumiverse can also build a frontend-only extension from `src/frontend.ts` when installing from source, but `dist/frontend.js` is included here for convenience.

## Before publishing

Replace the placeholder `github` and `homepage` URLs in `spindle.json` with the real public repository URL.

Cubby is independent and unofficial. It is not affiliated with or endorsed by Lumiverse.

## v0.1.1

- Fix Spindle private settings key format (`cubby:config-v1`). Current Spindle requires extension-private keys in `module:key` form.

## v0.1.2

- Register Cubby's manager UI before touching persistence, so a settings read failure can no longer make the extension invisible.
- Treat a missing first-run settings row as an empty config and bootstrap it automatically.
- Tolerate host bundles that leak the REST 404 from `ctx.settings.get()` instead of translating it to `undefined`.
- Add startup logging around manager registration and config initialization for less séance-based debugging.
