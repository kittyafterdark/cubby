const MAX_GROUPS = 8;
const CUBBY_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3.5 7.5h6l1.8 2h9.2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z"/>
  <path d="M3.5 7.5V6a2 2 0 0 1 2-2h3l1.8 2h8.2a2 2 0 0 1 2 2v1.5"/>
</svg>`;
function createId() {
    const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12);
    return `g_${random || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}`;
}
function cloneConfig(value) {
    return {
        version: 1,
        groups: value.groups.map((group) => ({
            id: group.id,
            name: group.name,
            members: group.members.map((member) => ({ ...member })),
        })),
    };
}
function normalizeConfig(input) {
    if (!input || typeof input !== 'object')
        return { version: 1, groups: [] };
    const raw = input;
    if (!Array.isArray(raw.groups))
        return { version: 1, groups: [] };
    const seenGroupIds = new Set();
    const seenMemberIds = new Set();
    const groups = [];
    for (const entry of raw.groups) {
        if (!entry || typeof entry !== 'object')
            continue;
        const candidate = entry;
        const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 80) : '';
        if (!name)
            continue;
        let id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : createId();
        if (seenGroupIds.has(id))
            id = createId();
        seenGroupIds.add(id);
        const members = [];
        if (Array.isArray(candidate.members)) {
            for (const rawMember of candidate.members) {
                if (!rawMember || typeof rawMember !== 'object')
                    continue;
                const member = rawMember;
                if (typeof member.id !== 'string' || !member.id.trim())
                    continue;
                const memberId = member.id.trim();
                if (seenMemberIds.has(memberId))
                    continue;
                seenMemberIds.add(memberId);
                members.push({
                    id: memberId,
                    label: typeof member.label === 'string' && member.label.trim() ? member.label.trim() : memberId,
                    owner: typeof member.owner === 'string' && member.owner ? member.owner : undefined,
                    iconName: typeof member.iconName === 'string' && member.iconName ? member.iconName : undefined,
                    iconSvg: typeof member.iconSvg === 'string' && member.iconSvg ? member.iconSvg : undefined,
                });
            }
        }
        groups.push({ id, name, members });
    }
    return { version: 1, groups };
}
function escapeCssString(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\a ')
        .replace(/\r/g, '\\d ')
        .replace(/\f/g, '\\c ');
}
function shortName(name) {
    return name.trim().slice(0, 8) || 'Cubby';
}
function iconInitial(label) {
    return (label.trim()[0] || '•').toUpperCase();
}
function originLabel(surface) {
    return surface.owner ? 'Extension' : 'Built-in';
}
function safeInlineSvg(svg) {
    try {
        // A surprising number of icon snippets (including our own fallbacks) are
        // bare <svg> fragments. Give them the SVG namespace before XML parsing so
        // imported nodes are real SVG elements in every browser, not inert boxes.
        const source = /<svg\b[^>]*\sxmlns=/.test(svg)
            ? svg
            : svg.replace(/<svg\b/i, '<svg xmlns=\"http://www.w3.org/2000/svg\"');
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
        const root = doc.documentElement;
        if (root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror'))
            return null;
        root.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
        root.querySelectorAll('*').forEach((node) => {
            for (const attr of [...node.attributes]) {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (name.startsWith('on'))
                    node.removeAttribute(attr.name);
                if ((name === 'href' || name === 'xlink:href') && /^(?:https?:|javascript:)/.test(value))
                    node.removeAttribute(attr.name);
            }
        });
        return document.importNode(root, true);
    }
    catch {
        return null;
    }
}
function drawerButtonFor(id) {
    const wanted = `drawer-tab:${id}`;
    const mounts = document.querySelectorAll('[data-spindle-mount="drawer_tab"][data-spindle-scope]');
    for (const mount of mounts) {
        if (mount.getAttribute('data-spindle-scope') === wanted)
            return mount.closest('button');
    }
    return null;
}
function cloneDrawerIcon(id) {
    const button = drawerButtonFor(id);
    if (!button)
        return null;
    const svg = button.querySelector('svg');
    if (svg)
        return svg.cloneNode(true);
    const image = button.querySelector('img');
    if (image) {
        const clone = image.cloneNode(true);
        clone.alt = '';
        return clone;
    }
    return null;
}
function drawerIconSnapshot(id) {
    const button = drawerButtonFor(id);
    if (!button)
        return {};
    const svg = button.querySelector('svg');
    if (svg)
        return { iconSvg: svg.outerHTML };
    const image = button.querySelector('img');
    const src = image?.currentSrc || image?.src;
    return src ? { iconName: src } : {};
}
const BUILTIN_ICONS = [
    [/summary|compose|prompt/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.8h8l4 4V20H6z"/><path d="M14 3.8V8h4"/><path d="M9 12h6M9 15.5h6"/></svg>'],
    [/world|wi\b|lore/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4M12 3.8c2 2.2 3.1 5 3.1 8.2S14 18 12 20.2C10 18 8.9 15.2 8.9 12S10 6 12 3.8z"/></svg>'],
    [/database|databank|data/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5.5" rx="7.2" ry="3"/><path d="M4.8 5.5v6c0 1.7 3.2 3 7.2 3s7.2-1.3 7.2-3v-6M4.8 11.5v6c0 1.7 3.2 3 7.2 3s7.2-1.3 7.2-3v-6"/></svg>'],
    [/book/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H11v16H6.2A2.2 2.2 0 0 0 4 21.2zM20 5.2A2.2 2.2 0 0 0 17.8 3H13v16h4.8a2.2 2.2 0 0 1 2.2 2.2z"/></svg>'],
    [/memory|cortex|brain/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 4.5A3 3 0 0 0 4.8 7a3.2 3.2 0 0 0 .2 5.9A3 3 0 0 0 9.7 17v2.2M14.6 4.5A3 3 0 0 1 19.2 7a3.2 3.2 0 0 1-.2 5.9A3 3 0 0 1 14.3 17v2.2M12 4v16M8 9.2h4M12 13.7h4"/></svg>'],
    [/profile|persona|character/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5.2 20a6.8 6.8 0 0 1 13.6 0"/></svg>'],
    [/regex/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3.5"/><path d="M15.5 5.5v7M12 9h7M15.5 15.5l3 3M18.5 15.5l-3 3"/></svg>'],
    [/reason/i, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a6 6 0 0 0-3.5 10.9V18h7v-3.6A6 6 0 0 0 12 3.5z"/><path d="M9.5 21h5M9 18h6"/></svg>'],
];
function fallbackIconSvg(id, label) {
    const haystack = `${id} ${label}`;
    return BUILTIN_ICONS.find(([pattern]) => pattern.test(haystack))?.[1] || null;
}
export function setup(ctx) {
    const cleanups = [];
    const groupRuntimes = new Map();
    let config = { version: 1, groups: [] };
    let surfaces = [];
    let surfacesById = new Map();
    let manager = null;
    let managerConsumesDrawerSlot = false;
    let removeHideStyle = null;
    let headerMount = null;
    let headerBackButton = null;
    let lastSurfaceSignature = '';
    let disposed = false;
    let configLoaded = false;
    const removeBaseStyle = ctx.dom.addStyle(`
    .cubby-root, .cubby-root * { box-sizing: border-box; }
    .cubby-root {
      width: 100%;
      min-height: 100%;
      padding: clamp(16px, 2vw, 28px);
      color: var(--lumiverse-text);
      font: inherit;
    }
    .cubby-stack {
      width: min(100%, 980px);
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }
    .cubby-topline {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
    }
    .cubby-heading { min-width: 0; }
    .cubby-eyebrow {
      color: var(--lumiverse-text-dim);
      font-size: 9px;
      letter-spacing: .16em;
      text-transform: uppercase;
      font-weight: 760;
    }
    .cubby-title {
      margin: 4px 0 0;
      font-size: 22px;
      line-height: 1.16;
      font-weight: 760;
      letter-spacing: -.02em;
    }
    .cubby-subtitle {
      margin: 7px 0 0;
      color: var(--lumiverse-text-muted);
      font-size: 11px;
      line-height: 1.5;
    }
    .cubby-copy {
      margin: 0;
      color: var(--lumiverse-text-muted);
      font-size: 12px;
      line-height: 1.55;
    }
    .cubby-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
    .cubby-button {
      appearance: none;
      border: 1px solid var(--lumiverse-border);
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text);
      border-radius: var(--lumiverse-radius);
      min-height: 32px;
      padding: 6px 10px;
      font: inherit;
      font-size: 11px;
      font-weight: 680;
      cursor: pointer;
      transition: var(--lumiverse-transition-fast);
    }
    .cubby-button:hover { border-color: var(--lumiverse-border-hover); background: var(--lumiverse-fill); }
    .cubby-button:disabled { cursor: not-allowed; opacity: .42; }
    .cubby-button--accent {
      border-color: color-mix(in srgb, var(--lumiverse-accent) 55%, var(--lumiverse-border));
      color: var(--lumiverse-accent-fg);
      background: var(--lumiverse-accent);
    }
    .cubby-button--danger { color: #e68a8a; }

    .cubby-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 11px;
    }
    .cubby-tile {
      appearance: none;
      width: 100%;
      min-width: 0;
      min-height: 116px;
      padding: 14px;
      display: grid;
      grid-template-rows: 40px auto auto;
      align-content: start;
      gap: 7px;
      text-align: left;
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * 1.15);
      background: color-mix(in srgb, var(--lumiverse-fill-subtle) 88%, transparent);
      color: var(--lumiverse-text);
      cursor: pointer;
      transition: transform var(--lumiverse-transition-fast), border-color var(--lumiverse-transition-fast), background var(--lumiverse-transition-fast), box-shadow var(--lumiverse-transition-fast);
    }
    .cubby-tile:hover {
      border-color: color-mix(in srgb, var(--lumiverse-accent) 34%, var(--lumiverse-border-hover));
      background: var(--lumiverse-fill);
      transform: translateY(-2px);
      box-shadow: 0 8px 22px rgba(0, 0, 0, .12);
    }
    .cubby-tile:focus-visible { outline: 2px solid var(--lumiverse-accent); outline-offset: 2px; }
    .cubby-tile:disabled { cursor: not-allowed; opacity: .42; transform: none; box-shadow: none; }
    .cubby-tile-icon {
      width: 38px;
      height: 38px;
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * .9);
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--lumiverse-text-muted);
      font-size: 13px;
      font-weight: 760;
      background: color-mix(in srgb, var(--lumiverse-fill) 90%, transparent);
    }
    .cubby-tile-icon svg { width: 21px; height: 21px; display: block; }
    .cubby-tile-icon img { width: 21px; height: 21px; object-fit: contain; }
    .cubby-tile-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 740;
    }
    .cubby-tile-meta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--lumiverse-text-dim);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .07em;
    }

    .cubby-empty {
      min-height: 210px;
      padding: 32px 20px;
      border: 1px dashed var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * 1.2);
      display: grid;
      place-items: center;
      text-align: center;
      background: color-mix(in srgb, var(--lumiverse-fill-subtle) 55%, transparent);
    }
    .cubby-empty-inner { max-width: 340px; display: grid; justify-items: center; gap: 11px; }
    .cubby-empty-icon { width: 48px; height: 48px; color: var(--lumiverse-text-muted); }
    .cubby-empty-icon svg { width: 100%; height: 100%; }

    .cubby-group-list { display: grid; gap: 9px; }
    .cubby-group-card {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * 1.05);
      background: color-mix(in srgb, var(--lumiverse-fill-subtle) 86%, transparent);
    }
    .cubby-group-card-icon {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      color: var(--lumiverse-text-muted);
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * .9);
      background: var(--lumiverse-fill-subtle);
    }
    .cubby-group-card-icon svg { width: 21px; height: 21px; }
    .cubby-group-card-title { font-size: 12px; font-weight: 750; }
    .cubby-group-card-meta { margin-top: 4px; color: var(--lumiverse-text-dim); font-size: 10px; }
    .cubby-warning {
      padding: 9px 10px;
      border: 1px solid color-mix(in srgb, #d9aa54 45%, var(--lumiverse-border));
      border-radius: var(--lumiverse-radius);
      color: var(--lumiverse-text-muted);
      background: color-mix(in srgb, #d9aa54 7%, var(--lumiverse-fill-subtle));
      font-size: 10px;
      line-height: 1.45;
    }

    .cubby-modal { display: grid; gap: 14px; padding: 2px 0 4px; }
    .cubby-field { display: grid; gap: 7px; }
    .cubby-label {
      color: var(--lumiverse-text-muted);
      font-size: 9px;
      font-weight: 760;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .cubby-input {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text);
      padding: 8px 10px;
      outline: none;
      font: inherit;
      font-size: 12px;
    }
    .cubby-input:focus { border-color: color-mix(in srgb, var(--lumiverse-accent) 42%, var(--lumiverse-border-hover)); }

    .cubby-folder-section { display: grid; gap: 7px; }
    .cubby-folder-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .cubby-folder-row {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: center;
      min-height: 46px;
      padding: 7px 9px;
      border: 1px dashed var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: color-mix(in srgb, var(--lumiverse-fill-subtle) 54%, transparent);
      color: var(--lumiverse-text-muted);
    }
    .cubby-folder-row-icon {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      color: var(--lumiverse-text-muted);
    }
    .cubby-folder-row-icon svg { width: 20px; height: 20px; }
    .cubby-folder-row-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 720; color: var(--lumiverse-text); }
    .cubby-folder-row-meta { margin-top: 2px; font-size: 9px; color: var(--lumiverse-text-dim); }

    .cubby-picker-shell { display: grid; gap: 7px; min-height: 0; }
    .cubby-picker-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .cubby-picker-count { color: var(--lumiverse-text-dim); font-size: 9px; }
    .cubby-picker {
      max-height: 355px;
      overflow: auto;
      display: grid;
      gap: 6px;
      padding: 1px 3px 1px 1px;
      scrollbar-gutter: stable;
    }
    .cubby-picker-row {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto 18px;
      gap: 9px;
      align-items: center;
      min-height: 52px;
      padding: 8px 9px;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: color-mix(in srgb, var(--lumiverse-fill-subtle) 82%, transparent);
      cursor: pointer;
      transition: var(--lumiverse-transition-fast);
    }
    .cubby-picker-row:hover { border-color: var(--lumiverse-border-hover); background: var(--lumiverse-fill); }
    .cubby-picker-row[data-selected="true"] {
      border-color: color-mix(in srgb, var(--lumiverse-accent) 54%, var(--lumiverse-border));
      background: color-mix(in srgb, var(--lumiverse-accent) 8%, var(--lumiverse-fill-subtle));
    }
    .cubby-picker-row[data-disabled="true"] { cursor: not-allowed; opacity: .44; }
    .cubby-picker-icon {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * .75);
      color: var(--lumiverse-text-muted);
      background: var(--lumiverse-fill-subtle);
      overflow: hidden;
      font-size: 10px;
      font-weight: 760;
    }
    .cubby-picker-icon svg, .cubby-picker-icon img { width: 18px; height: 18px; object-fit: contain; }
    .cubby-picker-main { min-width: 0; }
    .cubby-picker-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 720; }
    .cubby-picker-meta { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 3px; color: var(--lumiverse-text-dim); font-size: 9px; }
    .cubby-pill {
      max-width: 112px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 3px 7px;
      border: 1px solid var(--lumiverse-border);
      border-radius: 999px;
      color: var(--lumiverse-text-dim);
      font-size: 8px;
    }
    .cubby-picker-row input[type="checkbox"] { margin: 0; accent-color: var(--lumiverse-accent); }
    .cubby-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 7px;
      padding-top: 5px;
      border-top: 1px solid color-mix(in srgb, var(--lumiverse-border) 72%, transparent);
    }
    .cubby-header-back {
      appearance: none;
      display: none;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text-muted);
      padding: 4px 7px;
      font: inherit;
      font-size: 10px;
      cursor: pointer;
    }
    .cubby-header-back:hover { border-color: var(--lumiverse-border-hover); color: var(--lumiverse-text); }

    @media (max-width: 760px) {
      .cubby-root { padding: 14px; }
      .cubby-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .cubby-grid > .cubby-tile:last-child:nth-child(odd) { grid-column: 1 / -1; }
      .cubby-tile { min-height: 102px; padding: 12px; }
      .cubby-group-card { grid-template-columns: 38px minmax(0, 1fr); }
      .cubby-group-card .cubby-actions { grid-column: 1 / -1; }
    }
    @media (max-width: 470px) {
      .cubby-topline { align-items: stretch; }
      .cubby-title { font-size: 19px; }
      .cubby-grid { grid-template-columns: 1fr; }
      .cubby-grid > .cubby-tile:last-child:nth-child(odd) { grid-column: auto; }
      .cubby-picker-row { grid-template-columns: 30px minmax(0, 1fr) 18px; }
      .cubby-picker-row .cubby-pill { display: none; }
      .cubby-folder-strip { grid-template-columns: 1fr; }
      .cubby-folder-row { grid-template-columns: 28px minmax(0, 1fr); }
      .cubby-folder-row .cubby-pill { display: none; }
    }
  `);
    cleanups.push(removeBaseStyle);
    function availableSurface(id) {
        return surfacesById.get(id);
    }
    function maxGroups() {
        return managerConsumesDrawerSlot ? MAX_GROUPS - 1 : MAX_GROUPS;
    }
    async function persist(next) {
        config = normalizeConfig(next);
        configLoaded = true;
        syncGroupTabs();
        refreshHideStyle();
        renderManager();
        updateHeaderBack(ctx.ui.events.getDrawerState().tabId);
        ctx.sendToBackend({ type: 'save_config', config: cloneConfig(config) });
    }
    function currentMemberSnapshot(member) {
        const live = availableSurface(member.id);
        if (!live)
            return { ...member };
        const captured = drawerIconSnapshot(live.id);
        return {
            id: live.id,
            label: live.label || member.label || live.id,
            owner: live.owner,
            iconName: live.iconName || captured.iconName || member.iconName,
            iconSvg: live.iconSvg || captured.iconSvg || member.iconSvg,
        };
    }
    function refreshHideStyle() {
        removeHideStyle?.();
        removeHideStyle = null;
        const ids = new Set();
        for (const group of config.groups) {
            for (const member of group.members) {
                if (availableSurface(member.id))
                    ids.add(member.id);
            }
        }
        if (!ids.size)
            return;
        const rules = [...ids].map((id) => {
            const scope = `drawer-tab:${id}`;
            return `[data-spindle-mount="sidebar"] button:has([data-spindle-mount="drawer_tab"][data-spindle-scope="${escapeCssString(scope)}"]) { display: none !important; }`;
        });
        removeHideStyle = ctx.dom.addStyle(rules.join('\n'));
    }
    function appendSurfaceIcon(box, surface, snapshot, label, id) {
        // Extension surfaces usually provide iconSvg directly. Built-ins currently
        // do not, but their real Lucide SVG is already sitting in the host drawer.
        // Clone that exact rendered icon before falling back to stored metadata.
        if (surface?.iconSvg) {
            const svg = safeInlineSvg(surface.iconSvg);
            if (svg) {
                box.append(svg);
                return;
            }
        }
        const hostIcon = cloneDrawerIcon(id);
        if (hostIcon) {
            box.append(hostIcon);
            return;
        }
        if (snapshot?.iconSvg) {
            const svg = safeInlineSvg(snapshot.iconSvg);
            if (svg) {
                box.append(svg);
                return;
            }
        }
        const iconName = surface?.iconName || snapshot?.iconName;
        if (iconName && /^(?:data:|blob:|https?:|\/)/i.test(iconName)) {
            const img = document.createElement('img');
            img.src = iconName;
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', () => {
                box.replaceChildren(document.createTextNode(iconInitial(label)));
            }, { once: true });
            box.append(img);
            return;
        }
        const fallback = fallbackIconSvg(id, label);
        if (fallback) {
            const svg = safeInlineSvg(fallback);
            if (svg) {
                box.append(svg);
                return;
            }
        }
        box.textContent = iconInitial(label);
    }
    function makeSurfaceIcon(surface, snapshot, label, id, className = 'cubby-tile-icon') {
        const box = document.createElement('span');
        box.className = className;
        appendSurfaceIcon(box, surface, snapshot, label, id);
        return box;
    }
    async function openMember(memberId) {
        if (!ctx.host.surfaces)
            return;
        const surface = availableSurface(memberId);
        if (!surface)
            return;
        await ctx.host.surfaces.invoke({ kind: 'drawer_tab', id: memberId });
    }
    function renderGroup(group, root) {
        root.replaceChildren();
        root.className = 'cubby-root';
        const stack = document.createElement('div');
        stack.className = 'cubby-stack';
        const top = document.createElement('div');
        top.className = 'cubby-topline';
        const heading = document.createElement('div');
        heading.className = 'cubby-heading';
        const eyebrow = document.createElement('div');
        eyebrow.className = 'cubby-eyebrow';
        eyebrow.textContent = 'Cubby';
        const title = document.createElement('h3');
        title.className = 'cubby-title';
        title.textContent = group.name;
        const subtitle = document.createElement('p');
        subtitle.className = 'cubby-subtitle';
        subtitle.textContent = `${group.members.length} tab${group.members.length === 1 ? '' : 's'} tucked away`;
        heading.append(eyebrow, title, subtitle);
        const manage = document.createElement('button');
        manage.type = 'button';
        manage.className = 'cubby-button';
        manage.textContent = 'Manage';
        manage.addEventListener('click', () => manager?.activate());
        top.append(heading, manage);
        stack.append(top);
        if (!group.members.length) {
            const empty = document.createElement('div');
            empty.className = 'cubby-empty';
            const inner = document.createElement('div');
            inner.className = 'cubby-empty-inner';
            const copy = document.createElement('p');
            copy.className = 'cubby-copy';
            copy.textContent = 'This cubby is empty. Add a few drawer tabs and give the sidebar some breathing room.';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'cubby-button cubby-button--accent';
            edit.textContent = 'Add tabs';
            edit.addEventListener('click', () => openGroupEditor(group.id));
            inner.append(copy, edit);
            empty.append(inner);
            stack.append(empty);
        }
        else {
            const grid = document.createElement('div');
            grid.className = 'cubby-grid';
            for (const member of group.members) {
                const live = availableSurface(member.id);
                const label = live?.label || member.label || member.id;
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.className = 'cubby-tile';
                tile.disabled = !live;
                tile.title = live ? `Open ${label}` : `${label} is currently unavailable`;
                tile.append(makeSurfaceIcon(live, member, label, member.id));
                const name = document.createElement('span');
                name.className = 'cubby-tile-name';
                name.textContent = label;
                const meta = document.createElement('span');
                meta.className = 'cubby-tile-meta';
                meta.textContent = live ? originLabel(live) : 'Unavailable';
                tile.append(name, meta);
                if (live)
                    tile.addEventListener('click', () => void openMember(member.id));
                grid.append(tile);
            }
            stack.append(grid);
        }
        root.append(stack);
    }
    function renderAllGroups() {
        for (const runtime of groupRuntimes.values()) {
            renderGroup(runtime.group, runtime.handle.root);
        }
    }
    function syncGroupTabs() {
        const allowed = config.groups.slice(0, maxGroups());
        const allowedIds = new Set(allowed.map((group) => group.id));
        for (const [id, runtime] of [...groupRuntimes]) {
            if (!allowedIds.has(id)) {
                runtime.handle.destroy();
                groupRuntimes.delete(id);
            }
        }
        for (const group of allowed) {
            const existing = groupRuntimes.get(group.id);
            if (existing) {
                existing.group = group;
                existing.handle.setTitle(group.name);
                existing.handle.setShortName(shortName(group.name));
                renderGroup(group, existing.handle.root);
                continue;
            }
            try {
                const handle = ctx.ui.registerDrawerTab({
                    id: `cubby_${group.id}`,
                    title: group.name,
                    shortName: shortName(group.name),
                    description: `Open the ${group.name} Cubby`,
                    keywords: ['cubby', 'folder', 'group', group.name],
                    iconSvg: CUBBY_ICON,
                });
                groupRuntimes.set(group.id, { group, handle });
                renderGroup(group, handle.root);
            }
            catch (error) {
                console.warn('[Cubby] Could not register group drawer tab', group.name, error);
            }
        }
    }
    function assignments(exceptGroupId) {
        const map = new Map();
        for (const group of config.groups) {
            if (group.id === exceptGroupId)
                continue;
            for (const member of group.members)
                map.set(member.id, group);
        }
        return map;
    }
    function candidateMembers(group) {
        const map = new Map();
        for (const surface of surfaces) {
            const captured = drawerIconSnapshot(surface.id);
            map.set(surface.id, {
                id: surface.id,
                label: surface.label || surface.id,
                owner: surface.owner,
                iconName: surface.iconName || captured.iconName,
                iconSvg: surface.iconSvg || captured.iconSvg,
            });
        }
        for (const member of group?.members || []) {
            if (!map.has(member.id))
                map.set(member.id, { ...member });
        }
        return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    }
    function openGroupEditor(groupId) {
        const editing = groupId ? config.groups.find((group) => group.id === groupId) : undefined;
        if (!editing && config.groups.length >= maxGroups()) {
            void ctx.ui.showConfirm({
                title: 'Cubby limit reached',
                message: `This host allows up to ${maxGroups()} Cubby folder tabs in the current setup.`,
                variant: 'warning',
                confirmLabel: 'Okay',
                cancelLabel: 'Close',
            });
            return;
        }
        const modal = ctx.ui.showModal({
            title: editing ? `Edit ${editing.name}` : 'New Cubby',
            width: 590,
            maxHeight: 740,
        });
        const selected = new Set(editing?.members.map((member) => member.id) || []);
        const taken = assignments(editing?.id);
        const candidates = candidateMembers(editing);
        const body = document.createElement('div');
        body.className = 'cubby-modal';
        const nameField = document.createElement('label');
        nameField.className = 'cubby-field';
        const nameLabel = document.createElement('span');
        nameLabel.className = 'cubby-label';
        nameLabel.textContent = 'Name';
        const nameInput = document.createElement('input');
        nameInput.className = 'cubby-input';
        nameInput.type = 'text';
        nameInput.maxLength = 80;
        nameInput.placeholder = 'Writing';
        nameInput.value = editing?.name || '';
        nameField.append(nameLabel, nameInput);
        body.append(nameField);
        // Cubbies are intentionally shown outside the searchable tab picker. They
        // are destinations, not candidate children: no nesting, no accidental loops.
        if (config.groups.length) {
            const folderSection = document.createElement('section');
            folderSection.className = 'cubby-folder-section';
            const folderLabel = document.createElement('div');
            folderLabel.className = 'cubby-label';
            folderLabel.textContent = 'Cubbies';
            const folderStrip = document.createElement('div');
            folderStrip.className = 'cubby-folder-strip';
            for (const group of config.groups) {
                const row = document.createElement('div');
                row.className = 'cubby-folder-row';
                const icon = document.createElement('span');
                icon.className = 'cubby-folder-row-icon';
                const svg = safeInlineSvg(CUBBY_ICON);
                if (svg)
                    icon.append(svg);
                const info = document.createElement('span');
                const title = document.createElement('span');
                title.className = 'cubby-folder-row-name';
                title.textContent = group.name;
                const meta = document.createElement('span');
                meta.className = 'cubby-folder-row-meta';
                meta.textContent = `${group.members.length} tab${group.members.length === 1 ? '' : 's'} · not selectable`;
                info.append(title, meta);
                const pill = document.createElement('span');
                pill.className = 'cubby-pill';
                pill.textContent = editing?.id === group.id ? 'This Cubby' : 'Folder';
                row.append(icon, info, pill);
                folderStrip.append(row);
            }
            folderSection.append(folderLabel, folderStrip);
            body.append(folderSection);
        }
        const searchField = document.createElement('label');
        searchField.className = 'cubby-field';
        const searchLabel = document.createElement('span');
        searchLabel.className = 'cubby-label';
        searchLabel.textContent = 'Drawer tabs';
        const searchInput = document.createElement('input');
        searchInput.className = 'cubby-input';
        searchInput.type = 'search';
        searchInput.placeholder = 'Search tabs…';
        searchField.append(searchLabel, searchInput);
        body.append(searchField);
        const pickerShell = document.createElement('div');
        pickerShell.className = 'cubby-picker-shell';
        const pickerHead = document.createElement('div');
        pickerHead.className = 'cubby-picker-head';
        const pickerHint = document.createElement('span');
        pickerHint.className = 'cubby-copy';
        pickerHint.textContent = 'Choose what lives inside this Cubby.';
        const pickerCount = document.createElement('span');
        pickerCount.className = 'cubby-picker-count';
        pickerHead.append(pickerHint, pickerCount);
        const picker = document.createElement('div');
        picker.className = 'cubby-picker';
        pickerShell.append(pickerHead, picker);
        body.append(pickerShell);
        function drawPicker() {
            picker.replaceChildren();
            const needle = searchInput.value.trim().toLocaleLowerCase();
            const visible = candidates
                .filter((member) => {
                if (!needle)
                    return true;
                const live = availableSurface(member.id);
                return `${live?.label || member.label} ${live ? originLabel(live) : 'unavailable'}`.toLocaleLowerCase().includes(needle);
            })
                .sort((a, b) => {
                const aSelected = selected.has(a.id) ? 0 : 1;
                const bSelected = selected.has(b.id) ? 0 : 1;
                if (aSelected !== bSelected)
                    return aSelected - bSelected;
                return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
            });
            pickerCount.textContent = `${selected.size} selected · ${visible.length} shown`;
            if (!visible.length) {
                const copy = document.createElement('p');
                copy.className = 'cubby-copy';
                copy.textContent = candidates.length ? 'No drawer tabs match that search.' : 'No drawer tabs are available yet.';
                picker.append(copy);
                return;
            }
            for (const member of visible) {
                const assigned = taken.get(member.id);
                const live = availableSurface(member.id);
                const label = live?.label || member.label;
                const row = document.createElement('label');
                row.className = 'cubby-picker-row';
                row.dataset.disabled = assigned ? 'true' : 'false';
                row.dataset.selected = selected.has(member.id) ? 'true' : 'false';
                const icon = makeSurfaceIcon(live, member, label, member.id, 'cubby-picker-icon');
                const main = document.createElement('span');
                main.className = 'cubby-picker-main';
                const title = document.createElement('span');
                title.className = 'cubby-picker-name';
                title.textContent = label;
                const meta = document.createElement('span');
                meta.className = 'cubby-picker-meta';
                meta.textContent = assigned
                    ? `Already tucked into ${assigned.name}`
                    : live
                        ? originLabel(live)
                        : 'Unavailable · assignment will be kept';
                main.append(title, meta);
                const pill = document.createElement('span');
                pill.className = 'cubby-pill';
                pill.textContent = assigned ? `In ${assigned.name}` : live ? originLabel(live) : 'Dormant';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selected.has(member.id);
                checkbox.disabled = Boolean(assigned);
                checkbox.setAttribute('aria-label', `Include ${label}`);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked)
                        selected.add(member.id);
                    else
                        selected.delete(member.id);
                    drawPicker();
                });
                row.append(icon, main, pill, checkbox);
                picker.append(row);
            }
        }
        searchInput.addEventListener('input', drawPicker);
        drawPicker();
        const footer = document.createElement('div');
        footer.className = 'cubby-modal-footer';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'cubby-button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => modal.dismiss());
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'cubby-button cubby-button--accent';
        save.textContent = editing ? 'Save changes' : 'Create Cubby';
        save.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.focus();
                return;
            }
            const existingSnapshots = new Map((editing?.members || []).map((member) => [member.id, member]));
            const members = [...selected].map((id) => {
                const live = availableSurface(id);
                if (live) {
                    const captured = drawerIconSnapshot(live.id);
                    return {
                        id: live.id,
                        label: live.label || live.id,
                        owner: live.owner,
                        iconName: live.iconName || captured.iconName,
                        iconSvg: live.iconSvg || captured.iconSvg,
                    };
                }
                return existingSnapshots.get(id) || { id, label: id };
            });
            const next = cloneConfig(config);
            if (editing) {
                const target = next.groups.find((group) => group.id === editing.id);
                if (!target)
                    return;
                target.name = name.slice(0, 80);
                target.members = members;
            }
            else {
                next.groups.push({ id: createId(), name: name.slice(0, 80), members });
            }
            save.disabled = true;
            try {
                await persist(next);
                modal.dismiss();
            }
            finally {
                save.disabled = false;
            }
        });
        footer.append(cancel, save);
        body.append(footer);
        modal.root.replaceChildren(body);
        queueMicrotask(() => nameInput.focus());
    }
    async function deleteGroup(group) {
        const { confirmed } = await ctx.ui.showConfirm({
            title: `Delete ${group.name}?`,
            message: 'Its tabs will return to the sidebar. No underlying tab or extension data is deleted.',
            variant: 'danger',
            confirmLabel: 'Delete Cubby',
            cancelLabel: 'Cancel',
        });
        if (!confirmed)
            return;
        const next = cloneConfig(config);
        next.groups = next.groups.filter((candidate) => candidate.id !== group.id);
        await persist(next);
    }
    function renderManager() {
        if (!manager)
            return;
        const root = manager.root;
        root.replaceChildren();
        root.className = 'cubby-root';
        const stack = document.createElement('div');
        stack.className = 'cubby-stack';
        const top = document.createElement('div');
        top.className = 'cubby-topline';
        const heading = document.createElement('div');
        heading.className = 'cubby-heading';
        const eyebrow = document.createElement('div');
        eyebrow.className = 'cubby-eyebrow';
        eyebrow.textContent = 'Sidebar folders';
        const title = document.createElement('h3');
        title.className = 'cubby-title';
        title.textContent = 'Cubby';
        const subtitle = document.createElement('p');
        subtitle.className = 'cubby-subtitle';
        subtitle.textContent = 'Give the sidebar some breathing room.';
        heading.append(eyebrow, title, subtitle);
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'cubby-button cubby-button--accent';
        add.textContent = '+ New cubby';
        add.disabled = config.groups.length >= maxGroups();
        add.title = add.disabled ? `Maximum ${maxGroups()} cubbies in this setup` : 'Create a sidebar cubby';
        add.addEventListener('click', () => openGroupEditor());
        top.append(heading, add);
        stack.append(top);
        const intro = document.createElement('p');
        intro.className = 'cubby-copy';
        intro.textContent = 'Each drawer tab can live in one Cubby at a time. Delete a Cubby and its tabs simply return to the sidebar.';
        stack.append(intro);
        if (managerConsumesDrawerSlot) {
            const warning = document.createElement('div');
            warning.className = 'cubby-warning';
            warning.textContent = 'This host does not expose extension settings tabs, so Cubby is using one drawer slot for its manager. You can create up to 7 folder tabs here.';
            stack.append(warning);
        }
        if (!config.groups.length) {
            const empty = document.createElement('div');
            empty.className = 'cubby-empty';
            const inner = document.createElement('div');
            inner.className = 'cubby-empty-inner';
            const icon = document.createElement('div');
            icon.className = 'cubby-empty-icon';
            icon.innerHTML = CUBBY_ICON;
            const copy = document.createElement('p');
            copy.className = 'cubby-copy';
            copy.textContent = 'Give your sidebar some breathing room.';
            const create = document.createElement('button');
            create.type = 'button';
            create.className = 'cubby-button cubby-button--accent';
            create.textContent = 'Create your first Cubby';
            create.addEventListener('click', () => openGroupEditor());
            inner.append(icon, copy, create);
            empty.append(inner);
            stack.append(empty);
        }
        else {
            const list = document.createElement('div');
            list.className = 'cubby-group-list';
            config.groups.forEach((group, index) => {
                const card = document.createElement('div');
                card.className = 'cubby-group-card';
                const cardIcon = document.createElement('div');
                cardIcon.className = 'cubby-group-card-icon';
                const folderSvg = safeInlineSvg(CUBBY_ICON);
                if (folderSvg)
                    cardIcon.append(folderSvg);
                const info = document.createElement('div');
                const name = document.createElement('div');
                name.className = 'cubby-group-card-title';
                name.textContent = group.name;
                const meta = document.createElement('div');
                meta.className = 'cubby-group-card-meta';
                const availableCount = group.members.filter((member) => availableSurface(member.id)).length;
                const dormantCount = group.members.length - availableCount;
                const overflow = index >= maxGroups() ? ' · not mounted (drawer limit)' : '';
                meta.textContent = `${group.members.length} tab${group.members.length === 1 ? '' : 's'}${dormantCount ? ` · ${dormantCount} unavailable` : ''}${overflow}`;
                info.append(name, meta);
                const actions = document.createElement('div');
                actions.className = 'cubby-actions';
                const open = document.createElement('button');
                open.type = 'button';
                open.className = 'cubby-button';
                open.textContent = 'Open';
                const runtime = groupRuntimes.get(group.id);
                open.disabled = !runtime;
                open.addEventListener('click', () => runtime?.handle.activate());
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'cubby-button';
                edit.textContent = 'Edit';
                edit.addEventListener('click', () => openGroupEditor(group.id));
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'cubby-button cubby-button--danger';
                remove.textContent = 'Delete';
                remove.addEventListener('click', () => void deleteGroup(group));
                actions.append(open, edit, remove);
                card.append(cardIcon, info, actions);
                list.append(card);
            });
            stack.append(list);
        }
        root.append(stack);
    }
    function updateHeaderBack(activeTabId) {
        if (!headerBackButton)
            return;
        const group = config.groups.find((candidate) => candidate.members.some((member) => member.id === activeTabId));
        if (!group) {
            headerBackButton.style.display = 'none';
            headerBackButton.dataset.groupId = '';
            return;
        }
        headerBackButton.dataset.groupId = group.id;
        headerBackButton.textContent = `← ${group.name}`;
        headerBackButton.style.display = 'inline-flex';
    }
    function installHeaderBack() {
        try {
            const mount = ctx.ui.mount('drawer_header_actions');
            headerMount = mount;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'cubby-header-back';
            button.style.display = 'none';
            button.addEventListener('click', () => {
                const id = button.dataset.groupId;
                if (!id)
                    return;
                groupRuntimes.get(id)?.handle.activate();
            });
            mount.append(button);
            headerBackButton = button;
            cleanups.push(() => button.remove());
            updateHeaderBack(ctx.ui.events.getDrawerState().tabId);
        }
        catch (error) {
            console.debug('[Cubby] Drawer header mount not available yet', error);
        }
    }
    function handleSurfaceList(next) {
        const ownId = ctx.manifest.identifier;
        const filtered = next
            .filter((surface) => {
            if (surface.kind !== 'drawer_tab')
                return false;
            if (surface.owner === ownId)
                return false;
            // Some host builds expose extension drawer surfaces with a runtime owner
            // instead of the manifest identifier. Cubby's own synthetic destinations
            // are never valid children, so also reject them by their stable IDs.
            if (surface.id === 'cubby_manager' || surface.id === 'cubby_compatibility')
                return false;
            if (surface.id.startsWith('cubby_g_'))
                return false;
            return true;
        })
            .map((surface) => ({ ...surface }));
        const signature = JSON.stringify(filtered.map((surface) => [surface.id, surface.label, surface.owner, surface.iconName, Boolean(surface.iconSvg)]));
        if (signature === lastSurfaceSignature)
            return;
        lastSurfaceSignature = signature;
        surfaces = filtered;
        surfacesById = new Map(filtered.map((surface) => [surface.id, surface]));
        renderAllGroups();
        renderManager();
        refreshHideStyle();
    }
    try {
        if (!ctx.host.surfaces) {
            const fallback = ctx.ui.registerDrawerTab({
                id: 'cubby_compatibility',
                title: 'Cubby',
                shortName: 'Cubby',
                description: 'Cubby compatibility notice',
                iconSvg: CUBBY_ICON,
            });
            fallback.root.className = 'cubby-root';
            const message = document.createElement('div');
            message.className = 'cubby-empty';
            const copy = document.createElement('p');
            copy.className = 'cubby-copy';
            copy.textContent = 'Cubby needs a newer Spindle host with drawer surface discovery.';
            message.append(copy);
            fallback.root.append(message);
            cleanups.push(() => fallback.destroy());
            return () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
        }
        console.info('[Cubby] setup: registering manager UI');
        // Match known-good community extensions: Settings -> Extensions is a mount
        // surface, not a synthetic drawer/settings registry. Mounting here also lets
        // the Extensions panel mark Cubby as owning settings UI.
        try {
            const settingsMount = ctx.ui.mount('settings_extensions');
            const settingsRoot = document.createElement('div');
            settingsMount.appendChild(settingsRoot);
            manager = {
                root: settingsRoot,
                activate: () => {
                    const extensionId = settingsMount.getAttribute('data-spindle-extension-root');
                    ctx.events.emit('open-settings', {
                        view: 'extensions',
                        ...(extensionId ? { extensionId } : {}),
                    });
                },
                destroy: () => settingsRoot.remove(),
            };
            managerConsumesDrawerSlot = false;
        }
        catch (error) {
            console.warn('[Cubby] settings_extensions mount unavailable; using drawer manager fallback', error);
            managerConsumesDrawerSlot = true;
            const fallbackManager = ctx.ui.registerDrawerTab({
                id: 'cubby_manager',
                title: 'Cubby',
                shortName: 'Cubby',
                description: 'Manage sidebar cubbies',
                keywords: ['cubby', 'folders', 'sidebar', 'drawer', 'tabs', 'groups'],
                iconSvg: CUBBY_ICON,
            });
            manager = {
                root: fallbackManager.root,
                activate: () => fallbackManager.activate(),
                destroy: () => fallbackManager.destroy(),
            };
        }
        cleanups.push(() => manager?.destroy());
        // Use the backend's per-user extension storage, following working Spindle
        // extensions. Frontend ctx.settings is deliberately not used here: on some
        // current host bundles its bridge is disposed before async setup work runs.
        const unsubBackend = ctx.onBackendMessage((payload) => {
            if (!payload || typeof payload !== 'object')
                return;
            if (payload.type === 'config_loaded') {
                // Do not overwrite an edit made before a slow first load completes.
                if (configLoaded)
                    return;
                configLoaded = true;
                config = normalizeConfig(payload.config);
                syncGroupTabs();
                renderManager();
                refreshHideStyle();
                updateHeaderBack(ctx.ui.events.getDrawerState().tabId);
                console.info(`[Cubby] setup: loaded ${config.groups.length} cubby${config.groups.length === 1 ? '' : 'ies'}`);
            }
            else if (payload.type === 'config_error') {
                console.error('[Cubby] persistent config error', payload.error);
            }
        });
        cleanups.push(unsubBackend);
        ctx.sendToBackend({ type: 'get_config' });
        handleSurfaceList(ctx.host.surfaces.list(['drawer_tab']));
        syncGroupTabs();
        renderManager();
        refreshHideStyle();
        const unsubSurfaces = ctx.host.surfaces.subscribe(handleSurfaceList);
        cleanups.push(unsubSurfaces);
        const unsubDrawer = ctx.ui.events.onDrawerChange((state) => {
            if (!headerBackButton && state.open)
                installHeaderBack();
            updateHeaderBack(state.tabId);
        });
        cleanups.push(unsubDrawer);
        installHeaderBack();
        cleanups.push(() => {
            removeHideStyle?.();
            removeHideStyle = null;
            for (const runtime of groupRuntimes.values())
                runtime.handle.destroy();
            groupRuntimes.clear();
        });
        return () => {
            disposed = true;
            for (const cleanup of cleanups.splice(0).reverse()) {
                try {
                    cleanup();
                }
                catch (error) {
                    console.warn('[Cubby] cleanup failed', error);
                }
            }
        };
    }
    catch (error) {
        console.error('[Cubby] setup failed', error);
        return () => {
            disposed = true;
            for (const cleanup of cleanups.splice(0).reverse()) {
                try {
                    cleanup();
                }
                catch { }
            }
        };
    }
}
