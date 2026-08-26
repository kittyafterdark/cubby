const CONFIG_KEY = 'cubby:config-v1';
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
function ownerLabel(surface) {
    return surface.owner ? surface.owner : 'Built-in';
}
export async function setup(ctx) {
    ctx.deferReady();
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
    const removeBaseStyle = ctx.dom.addStyle(`
    .cubby-root, .cubby-root * { box-sizing: border-box; }
    .cubby-root {
      width: 100%;
      min-height: 100%;
      padding: 14px;
      color: var(--lumiverse-text);
      font: inherit;
    }
    .cubby-stack { display: grid; gap: 12px; }
    .cubby-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .cubby-eyebrow {
      color: var(--lumiverse-text-dim);
      font-size: 10px;
      letter-spacing: .14em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .cubby-title {
      margin: 2px 0 0;
      font-size: 18px;
      line-height: 1.2;
      font-weight: 700;
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
      font-weight: 650;
      cursor: pointer;
      transition: var(--lumiverse-transition-fast);
    }
    .cubby-button:hover { border-color: var(--lumiverse-border-hover); background: var(--lumiverse-fill); }
    .cubby-button:disabled { cursor: not-allowed; opacity: .45; }
    .cubby-button--accent {
      border-color: color-mix(in srgb, var(--lumiverse-accent) 55%, var(--lumiverse-border));
      color: var(--lumiverse-accent-fg);
      background: var(--lumiverse-accent);
    }
    .cubby-button--danger { color: #e68a8a; }
    .cubby-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
      gap: 9px;
    }
    .cubby-tile {
      appearance: none;
      width: 100%;
      min-width: 0;
      min-height: 94px;
      padding: 12px;
      display: grid;
      grid-template-rows: 32px auto auto;
      align-content: start;
      gap: 5px;
      text-align: left;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text);
      cursor: pointer;
      transition: var(--lumiverse-transition-fast);
    }
    .cubby-tile:hover { border-color: var(--lumiverse-border-hover); background: var(--lumiverse-fill); transform: translateY(-1px); }
    .cubby-tile:disabled { cursor: not-allowed; opacity: .45; transform: none; }
    .cubby-tile-icon {
      width: 28px;
      height: 28px;
      border: 1px solid var(--lumiverse-border);
      border-radius: calc(var(--lumiverse-radius) * .75);
      display: grid;
      place-items: center;
      overflow: hidden;
      color: var(--lumiverse-text-muted);
      font-size: 12px;
      font-weight: 750;
      background: var(--lumiverse-fill);
    }
    .cubby-tile-icon img { width: 18px; height: 18px; object-fit: contain; }
    .cubby-tile-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 700;
    }
    .cubby-tile-meta {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--lumiverse-text-dim);
      font-size: 9px;
    }
    .cubby-empty {
      min-height: 180px;
      padding: 28px 18px;
      border: 1px dashed var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      display: grid;
      place-items: center;
      text-align: center;
    }
    .cubby-empty-inner { max-width: 320px; display: grid; justify-items: center; gap: 9px; }
    .cubby-empty-icon {
      width: 44px; height: 44px; color: var(--lumiverse-text-muted);
    }
    .cubby-empty-icon svg { width: 100%; height: 100%; }
    .cubby-group-list { display: grid; gap: 8px; }
    .cubby-group-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 11px 12px;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
    }
    .cubby-group-card-title { font-size: 12px; font-weight: 750; }
    .cubby-group-card-meta { margin-top: 3px; color: var(--lumiverse-text-dim); font-size: 10px; }
    .cubby-warning {
      padding: 9px 10px;
      border: 1px solid color-mix(in srgb, #d9aa54 45%, var(--lumiverse-border));
      border-radius: var(--lumiverse-radius);
      color: var(--lumiverse-text-muted);
      background: color-mix(in srgb, #d9aa54 7%, var(--lumiverse-fill-subtle));
      font-size: 10px;
      line-height: 1.45;
    }
    .cubby-modal { display: grid; gap: 12px; padding: 2px 0 4px; }
    .cubby-field { display: grid; gap: 6px; }
    .cubby-label {
      color: var(--lumiverse-text-muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .cubby-input {
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
      color: var(--lumiverse-text);
      padding: 7px 9px;
      outline: none;
      font: inherit;
      font-size: 12px;
    }
    .cubby-input:focus { border-color: var(--lumiverse-border-hover); }
    .cubby-picker {
      max-height: min(52vh, 430px);
      overflow: auto;
      display: grid;
      gap: 5px;
      padding-right: 2px;
    }
    .cubby-picker-row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 8px 9px;
      border: 1px solid var(--lumiverse-border);
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
      cursor: pointer;
    }
    .cubby-picker-row:hover { border-color: var(--lumiverse-border-hover); }
    .cubby-picker-row[data-disabled="true"] { cursor: not-allowed; opacity: .45; }
    .cubby-picker-main { min-width: 0; }
    .cubby-picker-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 700; }
    .cubby-picker-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; color: var(--lumiverse-text-dim); font-size: 9px; }
    .cubby-pill {
      max-width: 112px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 3px 6px;
      border: 1px solid var(--lumiverse-border);
      border-radius: 999px;
      color: var(--lumiverse-text-dim);
      font-size: 8px;
    }
    .cubby-modal-footer { display: flex; justify-content: flex-end; gap: 7px; padding-top: 2px; }
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
    @media (max-width: 520px) {
      .cubby-root { padding: 10px; }
      .cubby-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
      .cubby-tile { min-height: 86px; padding: 10px; }
      .cubby-group-card { grid-template-columns: 1fr; }
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
        if (!ctx.settings)
            return;
        config = normalizeConfig(next);
        await ctx.settings.set(CONFIG_KEY, cloneConfig(config));
        syncGroupTabs();
        refreshHideStyle();
        renderManager();
        updateHeaderBack(ctx.ui.events.getDrawerState().tabId);
    }
    function currentMemberSnapshot(member) {
        const live = availableSurface(member.id);
        if (!live)
            return { ...member };
        return {
            id: live.id,
            label: live.label || member.label || live.id,
            owner: live.owner,
            iconName: live.iconName,
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
    function makeSurfaceIcon(surface, label) {
        const box = document.createElement('span');
        box.className = 'cubby-tile-icon';
        if (surface?.iconName) {
            const img = document.createElement('img');
            img.src = surface.iconName;
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', () => {
                box.replaceChildren(document.createTextNode(iconInitial(label)));
            }, { once: true });
            box.append(img);
        }
        else {
            box.textContent = iconInitial(label);
        }
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
        const eyebrow = document.createElement('div');
        eyebrow.className = 'cubby-eyebrow';
        eyebrow.textContent = 'Cubby';
        const title = document.createElement('h3');
        title.className = 'cubby-title';
        title.textContent = group.name;
        heading.append(eyebrow, title);
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
                tile.append(makeSurfaceIcon(live, label));
                const name = document.createElement('span');
                name.className = 'cubby-tile-name';
                name.textContent = label;
                const meta = document.createElement('span');
                meta.className = 'cubby-tile-meta';
                meta.textContent = live ? ownerLabel(live) : 'Unavailable';
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
            map.set(surface.id, {
                id: surface.id,
                label: surface.label || surface.id,
                owner: surface.owner,
                iconName: surface.iconName,
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
            width: 520,
            maxHeight: 650,
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
        const searchField = document.createElement('label');
        searchField.className = 'cubby-field';
        const searchLabel = document.createElement('span');
        searchLabel.className = 'cubby-label';
        searchLabel.textContent = 'Tabs';
        const searchInput = document.createElement('input');
        searchInput.className = 'cubby-input';
        searchInput.type = 'search';
        searchInput.placeholder = 'Search drawer tabs…';
        searchField.append(searchLabel, searchInput);
        const picker = document.createElement('div');
        picker.className = 'cubby-picker';
        function drawPicker() {
            picker.replaceChildren();
            const needle = searchInput.value.trim().toLocaleLowerCase();
            const visible = candidates.filter((member) => {
                if (!needle)
                    return true;
                return `${member.label} ${member.owner || 'built-in'}`.toLocaleLowerCase().includes(needle);
            });
            if (!visible.length) {
                const copy = document.createElement('p');
                copy.className = 'cubby-copy';
                copy.textContent = candidates.length ? 'No tabs match that search.' : 'No drawer tabs are available yet.';
                picker.append(copy);
                return;
            }
            for (const member of visible) {
                const assigned = taken.get(member.id);
                const live = availableSurface(member.id);
                const row = document.createElement('label');
                row.className = 'cubby-picker-row';
                row.dataset.disabled = assigned ? 'true' : 'false';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selected.has(member.id);
                checkbox.disabled = Boolean(assigned);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked)
                        selected.add(member.id);
                    else
                        selected.delete(member.id);
                });
                const main = document.createElement('span');
                main.className = 'cubby-picker-main';
                const title = document.createElement('span');
                title.className = 'cubby-picker-name';
                title.textContent = live?.label || member.label;
                const meta = document.createElement('span');
                meta.className = 'cubby-picker-meta';
                meta.textContent = live ? ownerLabel(live) : 'Unavailable — assignment will be kept';
                main.append(title, meta);
                const pill = document.createElement('span');
                pill.className = 'cubby-pill';
                pill.textContent = assigned ? `In ${assigned.name}` : live ? (live.owner ? 'Extension' : 'Built-in') : 'Dormant';
                row.append(checkbox, main, pill);
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
                    return {
                        id: live.id,
                        label: live.label || live.id,
                        owner: live.owner,
                        iconName: live.iconName,
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
        body.append(nameField, searchField, picker, footer);
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
        const eyebrow = document.createElement('div');
        eyebrow.className = 'cubby-eyebrow';
        eyebrow.textContent = 'Sidebar folders';
        const title = document.createElement('h3');
        title.className = 'cubby-title';
        title.textContent = 'Cubby';
        heading.append(eyebrow, title);
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
        intro.textContent = 'Group drawer tabs behind one comfy launcher. A tab can live in one Cubby at a time; removing a Cubby simply puts its children back in the sidebar.';
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
                card.append(info, actions);
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
            headerMount = ctx.ui.mount('drawer_header_actions');
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
            headerMount.append(button);
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
            .filter((surface) => surface.kind === 'drawer_tab' && surface.owner !== ownId)
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
        if (!ctx.settings || !ctx.host.surfaces) {
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
            copy.textContent = 'Cubby needs a newer Spindle host with persistent extension settings and host surface discovery.';
            message.append(copy);
            fallback.root.append(message);
            cleanups.push(() => fallback.destroy());
            return () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
        }
        console.info('[Cubby] setup: registering manager UI');
        if (ctx.ui.registerSettingsTab) {
            manager = ctx.ui.registerSettingsTab({
                id: 'cubby',
                title: 'Cubby',
                shortName: 'Cubby',
                iconSvg: CUBBY_ICON,
                description: 'Group drawer tabs into sidebar cubbies',
                keywords: ['cubby', 'folders', 'sidebar', 'drawer', 'tabs', 'groups'],
                position: 'bottom',
            });
            managerConsumesDrawerSlot = false;
        }
        else {
            managerConsumesDrawerSlot = true;
            manager = ctx.ui.registerDrawerTab({
                id: 'cubby_manager',
                title: 'Cubby',
                shortName: 'Cubby',
                description: 'Manage sidebar cubbies',
                keywords: ['cubby', 'folders', 'sidebar', 'drawer', 'tabs', 'groups'],
                iconSvg: CUBBY_ICON,
            });
        }
        cleanups.push(() => manager?.destroy());
        try {
            const saved = await ctx.settings.get(CONFIG_KEY);
            config = normalizeConfig(saved);
            if (saved === undefined) {
                await ctx.settings.set(CONFIG_KEY, cloneConfig(config));
                console.info('[Cubby] setup: initialized empty config');
            }
        } catch (error) {
            console.warn('[Cubby] setup: settings read failed; booting with empty config', error);
            config = { version: 1, groups: [] };
            try {
                await ctx.settings.set(CONFIG_KEY, cloneConfig(config));
                console.info('[Cubby] setup: initialized config after read failure');
            } catch (writeError) {
                console.error('[Cubby] setup: could not initialize persistent config', writeError);
            }
        }
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
        const unwatch = ctx.settings.watch(CONFIG_KEY, (value) => {
            if (disposed || !value)
                return;
            const normalized = normalizeConfig(value);
            if (JSON.stringify(normalized) === JSON.stringify(config))
                return;
            config = normalized;
            syncGroupTabs();
            renderManager();
            refreshHideStyle();
            updateHeaderBack(ctx.ui.events.getDrawerState().tabId);
        });
        cleanups.push(unwatch);
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
    finally {
        ctx.ready();
    }
}
