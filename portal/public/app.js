// Peppy Home Hub — Authentic Discord SPA Engine
'use strict';

// ==========================================================================
// 1. Application State & Audio Synthesizer
// ==========================================================================
export const state = {
  me: null,
  services: null,
  members: null,
  route: 'home',
  soundEnabled: true,
  currentAlbum: null,
  photosList: [],
  viewerIndex: 0,
};

// Web Audio API Synthesizer (Zero external files needed)
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

export function playChime(type = 'click') {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'message') {
      // Discord-style dual sine chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'drop') {
      // Bouncy drop sweep
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'success') {
      // Positive chord
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Subtle click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch {
    /* AudioContext not supported or blocked */
  }
}

// ==========================================================================
// 2. DOM & Formatting Helpers
// ==========================================================================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

export function toast(msg, isErr = false) {
  const t = el('div', { class: `toast${isErr ? ' err' : ''}` }, msg);
  $('#toasts').append(t);
  playChime(isErr ? 'click' : 'success');
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    t.style.transition = 'all 0.2s ease';
    setTimeout(() => t.remove(), 220);
  }, isErr ? 4500 : 2800);
}

export function fmtBytes(n) {
  if (n == null || isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = Number(n);
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDate(secOrMs) {
  if (!secOrMs) return '—';
  const d = new Date(secOrMs < 1e12 ? secOrMs * 1000 : secOrMs);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtAgo(ts) {
  if (!ts) return 'just now';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function avatarColor(id, preset) {
  if (preset) return preset;
  let h = 0;
  for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 42% 44%)`;
}

// ==========================================================================
// 3. API Client
// ==========================================================================
export async function api(path, opts = {}) {
  const init = {
    method: opts.method || 'GET',
    headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    credentials: 'same-origin',
  };
  if (opts.body && !(opts.body instanceof FormData)) init.body = JSON.stringify(opts.body);
  if (opts.body instanceof FormData) {
    init.body = opts.body;
    delete init.headers['Content-Type'];
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error('Cannot reach Home Server. Verify your local Wi-Fi connection.');
  }
  if (res.status === 401 && !path.endsWith('/me')) {
    showAuth(false);
    throw new Error('Your session expired. Please log in again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ==========================================================================
// 4. Authentication & Bootstrap
// ==========================================================================
let setupMode = false;

export function showAuth(isSetup) {
  setupMode = !!isSetup;
  $('#app').hidden = true;
  $('#auth-screen').hidden = false;
  $('#auth-title').textContent = setupMode ? 'Set up your Home Server' : 'Welcome Back!';
  $('#auth-sub').textContent = setupMode ? 'Create the master administrator account' : "We're so excited to see you again!";
  $('#setup-name-row').hidden = !setupMode;
  $('#setup-pass2-row').hidden = !setupMode;
  $('#f-pass').autocomplete = setupMode ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = setupMode ? 'Create Admin Account' : 'Log In';
  $('#auth-error').hidden = true;
}

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#auth-error');
  errBox.hidden = true;
  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    const username = $('#f-user').value.trim();
    const password = $('#f-pass').value;
    if (setupMode) {
      if (password !== $('#f-pass2').value) throw new Error('Passwords do not match.');
      await api('/api/auth/setup', {
        method: 'POST',
        body: { username, password, displayName: $('#f-display').value.trim() },
      });
    } else {
      await api('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
    }
    $('#f-pass').value = '';
    playChime('message');
    await boot();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
    playChime('click');
  } finally {
    btn.disabled = false;
  }
});

$('#signout-btn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  state.me = null;
  showAuth(false);
});

export async function boot() {
  let me;
  try {
    me = await api('/api/auth/me');
  } catch (err) {
    me = { error: err };
  }

  if (me.error || !me.user) {
    showAuth(me.needsSetup || false);
    return;
  }

  state.me = me.user;
  $('#auth-screen').hidden = true;
  $('#app').hidden = false;

  renderUserFooter();
  buildSidebar();

  const startRoute = location.hash.replace('#/', '') || 'home';
  await navigate(startRoute);

  refreshMembers();
  setInterval(refreshMembers, 30_000);

  refreshServices();
  setInterval(refreshServices, 30_000);

  initGlobalDragDrop();
  initProfilePopout();
  initGuildRail();
}

function renderUserFooter() {
  const u = state.me;
  if (!u) return;
  const av = $('#me-avatar');
  av.textContent = initials(u.displayName);
  av.style.backgroundColor = avatarColor(u.id, u.color);
  $('#me-name').textContent = u.displayName;

  // Custom status
  const storedStatus = localStorage.getItem('peppy_status') || (u.role === 'admin' ? '🕶️ V!83_C0D!N6' : 'Exploring Home Hub');
  $('#me-custom-status').textContent = storedStatus;
}

// ==========================================================================
// 5. Discord Channels & Navigation Tree
// ==========================================================================
const CHANNELS = [
  {
    group: 'Home Server',
    collapsed: false,
    items: [
      { id: 'home', name: 'home', icon: '#', topic: 'Welcome to your home server — dashboard & quick launcher' },
      { id: 'announcements', name: 'announcements', icon: '📢', topic: 'Official news and updates from the household' },
      { id: 'server-status', name: 'server-status', icon: '⚡', topic: 'Real-time telemetry, Jellyfin & Minecraft health' },
    ],
  },
  {
    group: 'Media & Cloud',
    collapsed: false,
    items: [
      { id: 'movies-and-tv', name: 'movies-and-tv', icon: '🎬', topic: 'Jellyfin streaming platform — browse home media' },
      { id: 'photos', name: 'peppy-photos', icon: '📷', topic: 'Private Google Photos-style gallery & memory albums' },
      { id: 'file-drop', name: 'file-drop', icon: '📁', topic: 'Instant drag & drop file sharing with the household' },
    ],
  },
  {
    group: 'Gaming',
    collapsed: false,
    items: [
      { id: 'minecraft', name: 'minecraft-paper', icon: '⛏️', topic: 'PaperMC Java Edition & Bedrock Cross-play Server' },
      { id: 'gaming-status', name: 'gaming-status', icon: '#', topic: 'Minecraft TCP Server List Ping & latency monitor' },
    ],
  },
  {
    group: 'User Settings',
    collapsed: false,
    items: [
      { id: 'my-account', name: 'my-account', icon: '⚙️', topic: 'Your profile, custom status, and security preferences' },
      { id: 'help-and-settings', name: 'help-and-faq', icon: '❓', topic: 'Home Wi-Fi connection guide and Termux tips' },
    ],
  },
  {
    group: 'Administration',
    adminOnly: true,
    collapsed: false,
    items: [
      { id: 'user-management', name: 'user-management', icon: '👥', topic: 'Manage family and guest accounts, roles & passwords' },
      { id: 'album-permissions', name: 'album-permissions', icon: '🔒', topic: 'Configure album visibility (everyone, private, shared)' },
      { id: 'server-settings', name: 'server-settings', icon: '🛠️', topic: 'Hub configuration, Jellyfin ports & storage limits' },
    ],
  },
];

export function allChannels() {
  return CHANNELS.flatMap((g) => (g.adminOnly && state.me?.role !== 'admin' ? [] : g.items));
}

function buildSidebar() {
  const list = $('#channel-list');
  list.replaceChildren();

  for (const group of CHANNELS) {
    if (group.adminOnly && state.me?.role !== 'admin') continue;

    const catHeader = el('div', { class: `category-header${group.collapsed ? ' collapsed' : ''}` },
      el('div', { class: 'cat-title-wrap' },
        el('span', { class: 'cat-chevron' }, '▼'),
        el('span', {}, group.group)
      ),
      el('span', { class: 'cat-add-icon', title: 'Category Options' }, '+')
    );

    const channelsContainer = el('div', { class: `category-channels${group.collapsed ? ' collapsed' : ''}` });

    catHeader.addEventListener('click', () => {
      group.collapsed = !group.collapsed;
      catHeader.classList.toggle('collapsed', group.collapsed);
      channelsContainer.classList.toggle('collapsed', group.collapsed);
      playChime('click');
    });

    for (const ch of group.items) {
      const channelNode = el('div', {
        class: `channel${state.route === ch.id ? ' selected' : ''}`,
        id: `ch-${ch.id}`,
        onclick: () => {
          location.hash = `#/${ch.id}`;
          closeDrawers();
          playChime('click');
        },
      },
      el('span', { class: 'ch-icon' }, ch.icon || '#'),
      el('span', { class: 'ch-name' }, ch.name),
      el('div', { class: 'channel-actions' },
        el('button', { class: 'channel-action-btn', title: 'Invite / Share' }, '👥'),
        el('button', { class: 'channel-action-btn', title: 'Settings' }, '⚙️')
      ));
      channelsContainer.append(channelNode);
    }

    list.append(catHeader, channelsContainer);
  }
}

function selectChannel(id) {
  $$('.channel.selected').forEach((n) => n.classList.remove('selected'));
  const node = $(`#ch-${CSS.escape(id)}`);
  if (node) node.classList.add('selected');

  const meta = allChannels().find((c) => c.id === id) || allChannels()[0];
  $('#channel-title').textContent = meta.name;
  $('#channel-topic').textContent = meta.topic || '';

  // Update guild rail active indicator
  $$('.guild-icon').forEach((b) => b.classList.remove('active'));
  $$('.guild-pill-wrapper').forEach((b) => b.classList.remove('active'));

  if (id === 'movies-and-tv') {
    $('#btn-guild-jellyfin')?.classList.add('active');
    $('#btn-guild-jellyfin')?.parentElement.classList.add('active');
  } else if (id === 'minecraft' || id === 'gaming-status') {
    $('#btn-guild-minecraft')?.classList.add('active');
    $('#btn-guild-minecraft')?.parentElement.classList.add('active');
  } else if (id === 'photos') {
    $('#btn-guild-photos')?.classList.add('active');
    $('#btn-guild-photos')?.parentElement.classList.add('active');
  } else if (id === 'file-drop') {
    $('#btn-guild-files')?.classList.add('active');
    $('#btn-guild-files')?.parentElement.classList.add('active');
  } else if (id === 'server-status') {
    $('#btn-guild-status')?.classList.add('active');
    $('#btn-guild-status')?.parentElement.classList.add('active');
  } else {
    $('#btn-guild-home')?.classList.add('active');
    $('#guild-home-wrap')?.classList.add('active');
  }
}

function initGuildRail() {
  $('#btn-guild-home')?.addEventListener('click', () => { location.hash = '#/home'; });
  $('#btn-guild-jellyfin')?.addEventListener('click', () => { location.hash = '#/movies-and-tv'; });
  $('#btn-guild-minecraft')?.addEventListener('click', () => { location.hash = '#/minecraft'; });
  $('#btn-guild-photos')?.addEventListener('click', () => { location.hash = '#/photos'; });
  $('#btn-guild-files')?.addEventListener('click', () => { location.hash = '#/file-drop'; });
  $('#btn-guild-status')?.addEventListener('click', () => { location.hash = '#/server-status'; });
}

// ==========================================================================
// 6. Router & Page Controller
// ==========================================================================
export const VIEWS = {};
let navToken = 0;

export async function navigate(id) {
  const token = ++navToken;
  const targetId = VIEWS[id] ? id : 'home';
  state.route = targetId;
  selectChannel(targetId);

  const content = $('#content');
  content.replaceChildren(el('div', { class: 'page-loading' }, el('div', { class: 'spinner' }), el('p', {}, `Loading #${targetId}…`)));

  try {
    const viewFn = VIEWS[targetId] || VIEWS.home;
    const viewNode = await viewFn();
    if (token !== navToken) return;
    content.replaceChildren(viewNode);
    content.scrollTop = 0;
  } catch (err) {
    if (token !== navToken) return;
    content.replaceChildren(el('div', { class: 'discord-embed embed-danger' },
      el('div', { class: 'embed-header' }, el('span', { class: 'embed-icon' }, '⚠️'), el('span', { class: 'embed-title' }, 'Error loading channel')),
      el('div', { class: 'embed-body' }, err.message),
      el('button', { class: 'btn btn-secondary btn-sm', onclick: () => navigate(id) }, 'Retry')
    ));
  }
}

window.addEventListener('hashchange', () => {
  if ($('#app').hidden) return;
  navigate(location.hash.replace('#/', '') || 'home');
});

// ==========================================================================
// 7. Member List & Presence (Matching Screenshot 1)
// ==========================================================================
export async function refreshMembers() {
  try {
    const res = await api('/api/status/members');
    state.members = res.members || [];
    renderMembersList();
  } catch {
    /* server ping failed */
  }
}

function renderMembersList() {
  const list = $('#members-list');
  if (!list || !state.members) return;
  list.replaceChildren();

  const onlineList = state.members.filter((m) => m.presence !== 'offline');
  const offlineList = state.members.filter((m) => m.presence === 'offline');

  // Online Section (Screenshot 1: "Online — 1")
  if (onlineList.length > 0) {
    list.append(el('div', { class: 'member-category-title' }, `ONLINE — ${onlineList.length}`));
    for (const m of onlineList) {
      list.append(buildMemberRow(m, false));
    }
  }

  // Offline Section (Screenshot 1: "Offline — 2")
  if (offlineList.length > 0) {
    list.append(el('div', { class: 'member-category-title offline-cat' }, `OFFLINE — ${offlineList.length}`));
    for (const m of offlineList) {
      list.append(buildMemberRow(m, true));
    }
  }
}

function buildMemberRow(m, isOffline) {
  const isAdmin = m.role === 'admin';
  const customStatus = isAdmin ? '🕶️ V!83_C0D!N6' : (isOffline ? 'Offline' : 'Exploring Home Hub');

  // Exact match to Screenshot 1 with custom banner for admin/owner
  const row = el('div', {
    class: `member-item${isAdmin ? ' has-banner' : ''}${isOffline ? ' is-offline' : ''}`,
    onclick: () => openProfilePopout(m),
  },
  el('div', { class: 'member-avatar-wrap' },
    el('div', {
      class: 'member-avatar',
      style: `background-color: ${avatarColor(m.id, m.color)}`,
    }, initials(m.displayName)),
    el('span', { class: `member-dot ${isOffline ? 'offline' : m.presence || 'online'}` })
  ),
  el('div', { class: 'member-info' },
    el('div', { class: 'member-name-row' },
      el('span', { class: 'member-name' }, m.displayName),
      isAdmin ? el('span', { class: 'member-crown', title: 'Server Owner' }, '👑') : null
    ),
    el('span', { class: 'member-custom-status' }, customStatus)
  ));

  return row;
}

// User Profile Popout Modal
function initProfilePopout() {
  $('#popout-close')?.addEventListener('click', () => {
    $('#profile-popout').hidden = true;
  });
  $('#profile-popout')?.addEventListener('click', (e) => {
    if (e.target.id === 'profile-popout') $('#profile-popout').hidden = true;
  });
  $('#me-profile-btn')?.addEventListener('click', () => {
    if (state.me) openProfilePopout(state.me);
  });
}

function openProfilePopout(user) {
  const pop = $('#profile-popout');
  if (!pop) return;

  $('#popout-name').textContent = user.displayName;
  $('#popout-handle').textContent = `@${user.username || user.displayName.toLowerCase().replace(/\s+/g, '_')}`;
  $('#popout-avatar').textContent = initials(user.displayName);
  $('#popout-avatar').style.backgroundColor = avatarColor(user.id, user.color);

  const isAdmin = user.role === 'admin';
  $('#popout-crown').hidden = !isAdmin;
  $('#popout-status').textContent = isAdmin ? '🕶️ V!83_C0D!N6' : 'Exploring Home Server';

  const rolesWrap = $('#popout-roles');
  rolesWrap.replaceChildren();

  const roleTag = el('span', { class: 'popout-role-tag' },
    el('span', { class: 'role-tag-dot' }),
    isAdmin ? 'Server Administrator' : (user.role === 'family' ? 'Family Member' : 'Guest')
  );
  rolesWrap.append(roleTag);

  pop.hidden = false;
  playChime('click');
}

// ==========================================================================
// 8. Service Health Prober
// ==========================================================================
export async function refreshServices() {
  try {
    const s = await api('/api/status/services');
    state.services = s;
    if (s.hubName) {
      $('#hub-name').textContent = s.hubName;
    }
  } catch {
    /* offline */
  }
}

// ==========================================================================
// 9. Cool Fullscreen File Drag & Drop Experience
// ==========================================================================
function initGlobalDragDrop() {
  const overlay = $('#drop-overlay');
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      overlay.hidden = false;
      playChime('drop');
    }
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.hidden = true;
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.hidden = true;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Direct transition to file-drop
    location.hash = '#/file-drop';
    await uploadDroppedFiles(Array.from(files));
  });
}

async function uploadDroppedFiles(fileList) {
  if (!fileList.length) return;
  toast(`Uploading ${fileList.length} file(s) to #file-drop...`);
  playChime('drop');

  const formData = new FormData();
  for (const f of fileList) {
    formData.append('file', f);
  }
  formData.append('visibility', 'everyone');

  try {
    const res = await api('/api/media/files', {
      method: 'POST',
      body: formData,
    });
    toast(`Successfully uploaded ${res.files?.length || 1} file(s)!`);
    playChime('success');
    if (state.route === 'file-drop') {
      navigate('file-drop');
    }
  } catch (err) {
    toast(`Upload failed: ${err.message}`, true);
  }
}

// ==========================================================================
// 10. Lightbox Photo Viewer
// ==========================================================================
export function openViewer(photos, index) {
  state.photosList = photos;
  state.viewerIndex = index;
  updateViewer();
  $('#viewer').hidden = false;
  playChime('click');
}

export function closeViewer() {
  $('#viewer').hidden = true;
}

function updateViewer() {
  if (!state.photosList.length) return;
  const p = state.photosList[state.viewerIndex];
  $('#viewer-img').src = `/api/media/photos/raw/${p.id}`;
  $('#viewer-caption').textContent = `${p.name} (${state.viewerIndex + 1} of ${state.photosList.length})`;
}

$('#viewer-close')?.addEventListener('click', closeViewer);
$('#viewer-prev')?.addEventListener('click', () => {
  if (state.photosList.length <= 1) return;
  state.viewerIndex = (state.viewerIndex - 1 + state.photosList.length) % state.photosList.length;
  updateViewer();
});
$('#viewer-next')?.addEventListener('click', () => {
  if (state.photosList.length <= 1) return;
  state.viewerIndex = (state.viewerIndex + 1) % state.photosList.length;
  updateViewer();
});

window.addEventListener('keydown', (e) => {
  if (!$('#viewer').hidden) {
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowLeft') $('#viewer-prev')?.click();
    if (e.key === 'ArrowRight') $('#viewer-next')?.click();
  }
});

// Sound Toggle Button
$('#sound-toggle-btn')?.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  $('#sound-toggle-btn').textContent = state.soundEnabled ? '🔊' : '🔇';
  toast(`Audio effects ${state.soundEnabled ? 'enabled' : 'muted'}`);
});

$('#settings-btn')?.addEventListener('click', () => {
  location.hash = '#/my-account';
});

// Mobile Drawers
function closeDrawers() {
  $('#sidebar').classList.remove('open');
  $('#members').classList.remove('open');
  $('#backdrop').hidden = true;
}
$('#sidebar-open')?.addEventListener('click', () => {
  $('#sidebar').classList.add('open');
  $('#backdrop').hidden = false;
});
$('#sidebar-close')?.addEventListener('click', closeDrawers);
$('#members-open')?.addEventListener('click', () => {
  $('#members').classList.toggle('open');
  $('#backdrop').hidden = !$('#members').classList.contains('open');
});
$('#members-close')?.addEventListener('click', closeDrawers);
$('#backdrop')?.addEventListener('click', closeDrawers);

// ==========================================================================
// 11. View Implementations (All 13 Channels)
// ==========================================================================

// --- VIEW 1: HOME ---
VIEWS.home = async () => {
  if (!state.services) await refreshServices();
  const s = state.services || {};
  const jfOnline = s.jellyfin?.state === 'online';
  const mcOnline = s.minecraft?.state === 'online';

  const root = el('div', { class: 'content-inner' });

  // Discord Channel Header
  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '#'),
    el('h1', { class: 'channel-welcome-title' }, 'Welcome to #home!'),
    el('p', { class: 'channel-welcome-desc' }, 'This is the start of your home server dashboard. Manage your cloud, media, and game servers all in one place.')
  ));

  // Quick Service Launchers Embed
  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🚀'),
      el('span', { class: 'embed-title' }, 'Home Server Quick Launcher'),
      el('span', { class: 'embed-badge' }, 'ONLINE')
    ),
    el('div', { class: 'embed-body' }, 'Access all home cloud services hosted directly on your local phone server.'),
    el('div', { class: 'embed-grid' },
      // Jellyfin Card
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Movies & TV (Jellyfin)'),
        el('div', { class: 'embed-field-value', style: `color: ${jfOnline ? 'var(--status-online)' : 'var(--status-dnd)'}` }, jfOnline ? '● Online' : '○ Offline'),
        el('button', {
          class: 'btn btn-discord btn-sm',
          style: 'margin-top: 8px;',
          onclick: () => {
            const url = s.jellyfin?.publicUrl || s.jellyfin?.internalUrl || 'http://192.168.31.178:8096';
            window.open(url, '_blank');
          },
        }, 'Open Jellyfin')
      ),
      // Minecraft Card
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Minecraft PaperMC'),
        el('div', { class: 'embed-field-value', style: `color: ${mcOnline ? 'var(--status-online)' : 'var(--status-dnd)'}` },
          mcOnline ? `● ${s.minecraft.playersOnline || 0}/${s.minecraft.playersMax || 20} Online` : '○ Offline'
        ),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          style: 'margin-top: 8px;',
          onclick: () => {
            navigator.clipboard.writeText('192.168.31.178:25565');
            toast('Copied server IP: 192.168.31.178:25565');
          },
        }, 'Copy IP')
      ),
      // Photos Card
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Peppy Photos'),
        el('div', { class: 'embed-field-value' }, 'Private Albums'),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          style: 'margin-top: 8px;',
          onclick: () => { location.hash = '#/photos'; },
        }, 'Browse Memories')
      ),
      // File Drop Card
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Instant File Drop'),
        el('div', { class: 'embed-field-value' }, 'Drag & Drop Any File'),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          style: 'margin-top: 8px;',
          onclick: () => { location.hash = '#/file-drop'; },
        }, 'Upload Files')
      )
    )
  ));

  // Storage and Telemetry Gauge
  const disk = s.system?.disks?.[0];
  if (disk) {
    root.append(el('div', { class: 'discord-embed embed-success' },
      el('div', { class: 'embed-header' },
        el('span', { class: 'embed-icon' }, '💾'),
        el('span', { class: 'embed-title' }, `Home Storage Usage (${disk.mount})`)
      ),
      el('div', { class: 'embed-body' },
        el('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 600;' },
          el('span', {}, `${fmtBytes(disk.usedBytes)} used of ${fmtBytes(disk.totalBytes)}`),
          el('span', {}, `${disk.usedPct}%`)
        ),
        el('div', { style: 'height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;' },
          el('div', { style: `height: 100%; width: ${disk.usedPct}%; background: var(--status-online); border-radius: 4px; transition: width 0.3s;` })
        )
      )
    ));
  }

  return root;
};

// --- VIEW 2: ANNOUNCEMENTS ---
VIEWS.announcements = async () => {
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '📢'),
    el('h1', { class: 'channel-welcome-title' }, 'Welcome to #announcements!'),
    el('p', { class: 'channel-welcome-desc' }, 'Stay informed on server maintenance, movie nights, and home updates.')
  ));

  const listWrap = el('div', { class: 'discord-msg-list' });
  root.append(listWrap);

  async function loadAnnouncements() {
    listWrap.replaceChildren(el('div', { class: 'page-loading' }, el('div', { class: 'spinner' })));
    try {
      const res = await api('/api/status/announcements');
      const items = res.items || [];
      listWrap.replaceChildren();

      if (items.length === 0) {
        listWrap.append(el('div', { class: 'discord-embed' },
          el('div', { class: 'embed-body' }, 'No announcements posted yet. Check back soon!')
        ));
        return;
      }

      for (const item of items) {
        const msgNode = el('div', { class: 'discord-msg' },
          el('div', { class: 'msg-avatar', style: 'background: #5865f2;' }, initials(item.authorName)),
          el('div', { class: 'msg-content' },
            el('div', { class: 'msg-header' },
              el('span', { class: 'msg-author owner' }, item.authorName),
              el('span', { class: 'msg-badge' }, 'ADMIN'),
              el('span', { class: 'msg-timestamp' }, fmtDate(item.createdAt))
            ),
            el('div', { class: 'msg-body' },
              el('strong', { style: 'display: block; font-size: 15px; margin-bottom: 4px; color: #fff;' }, item.title),
              item.text
            )
          )
        );

        if (state.me?.role === 'admin') {
          const delBtn = el('button', {
            class: 'btn btn-danger btn-sm',
            style: 'margin-left: auto; align-self: flex-start;',
            onclick: async () => {
              if (confirm('Delete announcement?')) {
                await api(`/api/status/announcements/${item.id}`, { method: 'DELETE' });
                toast('Announcement deleted');
                loadAnnouncements();
              }
            },
          }, 'Delete');
          msgNode.append(delBtn);
        }

        listWrap.append(msgNode);
      }
    } catch (err) {
      listWrap.replaceChildren(el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, err.message)));
    }
  }

  // Admin Composer Box
  if (state.me?.role === 'admin') {
    const composerBox = el('div', { class: 'discord-embed', style: 'margin-top: 24px;' },
      el('div', { class: 'embed-header' },
        el('span', { class: 'embed-icon' }, '✍️'),
        el('span', { class: 'embed-title' }, 'Post New Household Announcement')
      ),
      el('div', { class: 'field' },
        el('input', { id: 'ann-title', type: 'text', placeholder: 'Announcement Title (e.g. Server Maintenance tonight)' })
      ),
      el('div', { class: 'field' },
        el('textarea', { id: 'ann-body', placeholder: 'Write your message to the household...' })
      ),
      el('button', {
        class: 'btn btn-discord',
        onclick: async () => {
          const title = $('#ann-title').value.trim();
          const text = $('#ann-body').value.trim();
          if (!title || !text) return toast('Please enter title and content', true);
          try {
            await api('/api/status/announcements', { method: 'POST', body: { title, text } });
            toast('Announcement published!');
            $('#ann-title').value = '';
            $('#ann-body').value = '';
            loadAnnouncements();
          } catch (e) {
            toast(e.message, true);
          }
        },
      }, 'Publish Announcement')
    );
    root.append(composerBox);
  }

  loadAnnouncements();
  return root;
};

// --- VIEW 3: SERVER STATUS ---
VIEWS['server-status'] = async () => {
  const root = el('div', { class: 'content-inner' });
  const s = await api('/api/status/services');

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '⚡'),
    el('h1', { class: 'channel-welcome-title' }, '#server-status'),
    el('p', { class: 'channel-welcome-desc' }, 'Live hardware and software diagnostics from the Android Termux home server.')
  ));

  // System Hardware Embed
  const sys = s.system || {};
  const memUsed = (sys.memTotalBytes || 0) - (sys.memFreeBytes || 0);
  const memPct = sys.memTotalBytes ? Math.round((memUsed / sys.memTotalBytes) * 100) : 0;

  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🖥️'),
      el('span', { class: 'embed-title' }, `Host: ${sys.hostname || 'Android Server'}`),
      el('span', { class: 'embed-badge' }, sys.platform || 'Linux Termux')
    ),
    el('div', { class: 'embed-grid' },
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'CPU Cores'),
        el('div', { class: 'embed-field-value' }, `${sys.cpuCount || '—'} Cores (${sys.loadAvg ? sys.loadAvg.join(', ') : 'Normal'})`)
      ),
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Uptime'),
        el('div', { class: 'embed-field-value' }, `${Math.floor((sys.uptimeSec || 0) / 3600)}h ${Math.floor(((sys.uptimeSec || 0) % 3600) / 60)}m`)
      ),
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'RAM Usage'),
        el('div', { class: 'embed-field-value' }, `${fmtBytes(memUsed)} / ${fmtBytes(sys.memTotalBytes)} (${memPct}%)`)
      ),
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Node Engine'),
        el('div', { class: 'embed-field-value' }, sys.nodeVersion || 'v20+')
      )
    )
  ));

  // Service States
  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🚦'),
      el('span', { class: 'embed-title' }, 'Active Daemon Probes')
    ),
    el('div', { class: 'embed-grid' },
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Jellyfin Media Server'),
        el('div', { class: 'embed-field-value' }, s.jellyfin?.state === 'online' ? `● Online (v${s.jellyfin.version || 'Latest'})` : '○ Offline')
      ),
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Minecraft Server List Ping'),
        el('div', { class: 'embed-field-value' }, s.minecraft?.state === 'online' ? `● Online (${s.minecraft.pingMs || 12}ms ping)` : '○ Offline')
      )
    )
  ));

  return root;
};

// --- VIEW 4: MOVIES & TV (JELLYFIN) ---
VIEWS['movies-and-tv'] = async () => {
  const root = el('div', { class: 'content-inner' });
  const s = state.services || await api('/api/status/services');
  const jf = s.jellyfin || {};
  const isOnline = jf.state === 'online';
  const streamUrl = jf.publicUrl || jf.internalUrl || 'http://192.168.31.178:8096';

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '🎬'),
    el('h1', { class: 'channel-welcome-title' }, '#movies-and-tv'),
    el('p', { class: 'channel-welcome-desc' }, 'Stream films, TV series, anime, and home videos straight from the server.')
  ));

  // Discord Watch Together Embed
  root.append(el('div', { class: `discord-embed ${isOnline ? 'embed-nitro' : 'embed-danger'}` },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🍿'),
      el('span', { class: 'embed-title' }, 'Jellyfin Home Cinema'),
      el('span', { class: 'embed-badge' }, isOnline ? 'STREAMING READY' : 'OFFLINE')
    ),
    el('div', { class: 'embed-body' },
      'Enjoy fast local network video streaming on phone, laptop, desktop, or Android TV.'
    ),
    el('div', { style: 'display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px;' },
      el('button', {
        class: 'btn btn-discord',
        onclick: () => window.open(streamUrl, '_blank'),
      }, '▶ Launch Jellyfin Player'),
      el('button', {
        class: 'btn btn-secondary',
        onclick: () => {
          navigator.clipboard.writeText(streamUrl);
          toast(`Copied Jellyfin URL: ${streamUrl}`);
        },
      }, '📋 Copy Stream URL')
    )
  ));

  // Guest Credentials & Smart TV Help Embed
  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '📺'),
      el('span', { class: 'embed-title' }, 'Connecting from Android TV or iPad')
    ),
    el('div', { class: 'embed-body' },
      '1. Open the Jellyfin app on your Smart TV or tablet.\n' +
      '2. Enter server host address: http://192.168.31.178:8096\n' +
      '3. Log in with your assigned family username and password.'
    )
  ));

  return root;
};

// --- VIEW 5: PHOTOS ---
VIEWS.photos = async () => {
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '📷'),
    el('h1', { class: 'channel-welcome-title' }, '#peppy-photos'),
    el('p', { class: 'channel-welcome-desc' }, 'Explore albums and private photographs stored safely on the phone SD card.')
  ));

  const contentArea = el('div', { id: 'photo-content-area' });
  root.append(contentArea);

  async function loadAlbums() {
    contentArea.replaceChildren(el('div', { class: 'page-loading' }, el('div', { class: 'spinner' })));
    try {
      const res = await api('/api/media/photos/albums');
      const albums = res.albums || [];

      if (albums.length === 0) {
        contentArea.replaceChildren(el('div', { class: 'discord-embed' },
          el('div', { class: 'embed-body' }, 'No photo albums detected. Place photos in your configured photoRoots folder.')
        ));
        return;
      }

      const grid = el('div', { class: 'photo-album-grid' });
      for (const alb of albums) {
        const card = el('div', {
          class: 'album-card-discord',
          onclick: () => loadAlbumPhotos(alb),
        },
        el('img', {
          class: 'album-cover-img',
          src: alb.coverPhotoId ? `/api/media/photos/thumb/${alb.coverPhotoId}` : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%232b2d31"/><text x="50" y="55" font-size="28" text-anchor="middle" fill="%23949ba4">📷</text></svg>',
          alt: alb.name,
          loading: 'lazy',
        }),
        el('div', { class: 'album-meta-box' },
          el('div', { class: 'album-name' }, alb.name),
          el('div', { class: 'album-count' }, `${alb.photoCount || 0} photos`)
        ));
        grid.append(card);
      }
      contentArea.replaceChildren(grid);
    } catch (e) {
      contentArea.replaceChildren(el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, e.message)));
    }
  }

  async function loadAlbumPhotos(alb) {
    contentArea.replaceChildren(el('div', { class: 'page-loading' }, el('div', { class: 'spinner' })));
    try {
      const res = await api(`/api/media/photos/album/${alb.id}`);
      const photos = res.album?.photos || [];

      const topBar = el('div', { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 16px;' },
        el('button', {
          class: 'btn btn-secondary btn-sm',
          onclick: loadAlbums,
        }, '← Back to Albums'),
        el('h2', { style: 'font-size: 18px; font-weight: 700;' }, `${alb.name} (${photos.length})`)
      );

      const photoGrid = el('div', { class: 'photo-grid-discord' });
      photos.forEach((photo, idx) => {
        const item = el('div', {
          class: 'photo-thumb-wrap',
          onclick: () => openViewer(photos, idx),
        },
        el('img', {
          src: `/api/media/photos/thumb/${photo.id}`,
          alt: photo.name,
          loading: 'lazy',
        }));
        photoGrid.append(item);
      });

      contentArea.replaceChildren(topBar, photoGrid);
    } catch (e) {
      contentArea.replaceChildren(el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, e.message)));
    }
  }

  loadAlbums();
  return root;
};

// --- VIEW 6: FILE DROP ---
VIEWS['file-drop'] = async () => {
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '📁'),
    el('h1', { class: 'channel-welcome-title' }, '#file-drop'),
    el('p', { class: 'channel-welcome-desc' }, 'Drop files from your PC or phone to instantly transfer them across the home network.')
  ));

  // Big Discord Dropzone
  const fileInput = el('input', { type: 'file', multiple: true, style: 'display: none;' });
  const dropzone = el('div', {
    class: 'file-dropzone-box',
    onclick: () => fileInput.click(),
  },
  el('div', { style: 'font-size: 38px; margin-bottom: 8px;' }, '☁️'),
  el('h3', { style: 'font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 4px;' }, 'Click or Drag Files Here to Upload'),
  el('p', { style: 'font-size: 13px; color: var(--text-muted);' }, 'Supports documents, archives, videos, APKs, and photos.')
  );

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) {
      uploadDroppedFiles(Array.from(fileInput.files));
    }
  });

  root.append(fileInput, dropzone);

  const fileListTable = el('div', { id: 'file-table-wrap' });
  root.append(fileListTable);

  async function loadFiles() {
    fileListTable.replaceChildren(el('div', { class: 'page-loading' }, el('div', { class: 'spinner' })));
    try {
      const res = await api('/api/media/files');
      const files = res.files || [];

      if (files.length === 0) {
        fileListTable.replaceChildren(el('div', { class: 'discord-embed' },
          el('div', { class: 'embed-body' }, 'No files uploaded yet. Drag and drop any file above!')
        ));
        return;
      }

      const table = el('table', { class: 'file-list-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'File Name'),
            el('th', {}, 'Size'),
            el('th', {}, 'Uploaded'),
            el('th', {}, 'Uploader'),
            el('th', { style: 'text-align: right;' }, 'Actions')
          )
        ),
        el('tbody', {})
      );

      const tbody = table.querySelector('tbody');
      for (const f of files) {
        const row = el('tr', {},
          el('td', { style: 'font-weight: 600; color: #fff;' }, f.name),
          el('td', {}, fmtBytes(f.size)),
          el('td', {}, fmtAgo(f.uploadedAt)),
          el('td', {}, f.ownerName || 'Someone'),
          el('td', { style: 'text-align: right;' },
            el('button', {
              class: 'btn btn-discord btn-sm',
              style: 'margin-right: 6px;',
              onclick: () => {
                window.location.href = `/api/media/files/${f.id}/download`;
              },
            }, 'Download'),
            (f.mine || state.me?.role === 'admin') ? el('button', {
              class: 'btn btn-danger btn-sm',
              onclick: async () => {
                if (confirm(`Delete ${f.name}?`)) {
                  await api(`/api/media/files/${f.id}`, { method: 'DELETE' });
                  toast('File deleted');
                  loadFiles();
                }
              },
            }, 'Delete') : null
          )
        );
        tbody.append(row);
      }

      fileListTable.replaceChildren(table);
    } catch (e) {
      fileListTable.replaceChildren(el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, e.message)));
    }
  }

  loadFiles();
  return root;
};

// --- VIEW 7: MINECRAFT ---
VIEWS.minecraft = async () => {
  const root = el('div', { class: 'content-inner' });
  const s = state.services || await api('/api/status/services');
  const mc = s.minecraft || {};
  const isOnline = mc.state === 'online';

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '⛏️'),
    el('h1', { class: 'channel-welcome-title' }, '#minecraft'),
    el('p', { class: 'channel-welcome-desc' }, 'Join our survival multiplayer server hosted natively on PaperMC.')
  ));

  // Game Presence Card
  root.append(el('div', { class: `discord-embed ${isOnline ? 'embed-success' : 'embed-danger'}` },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🎮'),
      el('span', { class: 'embed-title' }, 'PaperMC Java & Bedrock Survival'),
      el('span', { class: 'embed-badge' }, isOnline ? 'ONLINE' : 'OFFLINE')
    ),
    el('div', { class: 'embed-body' },
      el('div', { style: 'font-weight: 700; font-size: 15px; margin-bottom: 6px;' }, mc.motd || 'Welcome to Peppy SMP!'),
      el('div', { style: 'color: var(--text-muted); font-size: 13px;' }, `Version: ${mc.version || '1.21.x'} • Latency: ${mc.pingMs || 14}ms`)
    ),
    el('div', { class: 'embed-grid' },
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Java Edition IP'),
        el('div', { class: 'embed-field-value' }, '192.168.31.178:25565'),
        el('button', {
          class: 'btn btn-discord btn-sm',
          style: 'margin-top: 6px;',
          onclick: () => {
            navigator.clipboard.writeText('192.168.31.178:25565');
            toast('Copied Java IP: 192.168.31.178:25565');
          },
        }, 'Copy Java IP')
      ),
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Bedrock (Mobile/Xbox) IP'),
        el('div', { class: 'embed-field-value' }, '192.168.31.178 (Port 19132)'),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          style: 'margin-top: 6px;',
          onclick: () => {
            navigator.clipboard.writeText('192.168.31.178');
            toast('Copied Bedrock IP: 192.168.31.178 (Port 19132)');
          },
        }, 'Copy Bedrock IP')
      ),
      el('div', { class: 'embed-field' },
        el('div', { class: 'embed-field-label' }, 'Players Online'),
        el('div', { class: 'embed-field-value' }, `${mc.playersOnline || 0} / ${mc.playersMax || 20}`)
      )
    )
  ));

  return root;
};

// --- VIEW 8: GAMING STATUS ---
VIEWS['gaming-status'] = async () => {
  return VIEWS.minecraft();
};

// --- VIEW 9: MY ACCOUNT ---
VIEWS['my-account'] = async () => {
  const root = el('div', { class: 'content-inner' });
  const u = state.me;

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '⚙️'),
    el('h1', { class: 'channel-welcome-title' }, '#my-account'),
    el('p', { class: 'channel-welcome-desc' }, 'Manage your Discord profile, custom status, and security password.')
  ));

  // Profile Card Preview
  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '👤'),
      el('span', { class: 'embed-title' }, 'User Profile Preview')
    ),
    el('div', { style: 'display: flex; align-items: center; gap: 16px; margin-bottom: 16px;' },
      el('div', { class: 'avatar', style: `width: 52px; height: 52px; font-size: 20px; background-color: ${avatarColor(u.id, u.color)};` }, initials(u.displayName)),
      el('div', {},
        el('div', { style: 'font-size: 18px; font-weight: 700; color: #fff;' }, u.displayName),
        el('div', { style: 'color: var(--text-muted); font-size: 13px;' }, `@${u.username} • Role: ${u.role}`)
      )
    ),
    el('div', { class: 'field' },
      el('label', {}, 'CUSTOM STATUS PHRASE'),
      el('input', {
        id: 'user-custom-status-input',
        type: 'text',
        value: localStorage.getItem('peppy_status') || '🕶️ V!83_C0D!N6',
      }),
      el('button', {
        class: 'btn btn-discord btn-sm',
        style: 'margin-top: 8px;',
        onclick: () => {
          const val = $('#user-custom-status-input').value.trim();
          localStorage.setItem('peppy_status', val);
          $('#me-custom-status').textContent = val;
          toast('Custom status updated!');
        },
      }, 'Save Status')
    )
  ));

  // Change Password
  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🔑'),
      el('span', { class: 'embed-title' }, 'Change Password')
    ),
    el('div', { class: 'field' },
      el('label', {}, 'CURRENT PASSWORD'),
      el('input', { id: 'pwd-current', type: 'password' })
    ),
    el('div', { class: 'field' },
      el('label', {}, 'NEW PASSWORD'),
      el('input', { id: 'pwd-new', type: 'password' })
    ),
    el('button', {
      class: 'btn btn-secondary',
      onclick: async () => {
        const cur = $('#pwd-current').value;
        const next = $('#pwd-new').value;
        if (!cur || !next) return toast('Please fill in both fields', true);
        try {
          await api('/api/auth/password', {
            method: 'POST',
            body: { currentPassword: cur, newPassword: next },
          });
          toast('Password changed successfully!');
          $('#pwd-current').value = '';
          $('#pwd-new').value = '';
        } catch (e) {
          toast(e.message, true);
        }
      },
    }, 'Update Password')
  ));

  return root;
};

// --- VIEW 10: HELP AND SETTINGS ---
VIEWS['help-and-settings'] = async () => {
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '❓'),
    el('h1', { class: 'channel-welcome-title' }, '#help-and-faq'),
    el('p', { class: 'channel-welcome-desc' }, 'Quick guides and troubleshooting for your home Wi-Fi server.')
  ));

  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '📶'),
      el('span', { class: 'embed-title' }, 'Wi-Fi Connection & IP Address')
    ),
    el('div', { class: 'embed-body' },
      'The Peppy Home Hub is broadcast exclusively on your home router network.\n' +
      '• Dashboard URL: http://192.168.31.178:7777\n' +
      '• Jellyfin URL: http://192.168.31.178:8096\n' +
      '• Minecraft Java: 192.168.31.178:25565'
    )
  ));

  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '🔋'),
      el('span', { class: 'embed-title' }, 'Android Battery Optimization & Termux')
    ),
    el('div', { class: 'embed-body' },
      'To prevent Android from killing server services when the phone screen is off:\n' +
      '1. Run termux-wake-lock in Termux.\n' +
      '2. Exclude Termux from battery saver in Android App Settings.'
    )
  ));

  return root;
};

// --- VIEW 11: USER MANAGEMENT (ADMIN ONLY) ---
VIEWS['user-management'] = async () => {
  if (state.me?.role !== 'admin') {
    return el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, 'Admins only.'));
  }
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '👥'),
    el('h1', { class: 'channel-welcome-title' }, '#user-management'),
    el('p', { class: 'channel-welcome-desc' }, 'Create and manage household member accounts, assign roles, and revoke access.')
  ));

  const tableWrap = el('div', {});
  root.append(tableWrap);

  async function loadUsers() {
    tableWrap.replaceChildren(el('div', { class: 'page-loading' }, el('div', { class: 'spinner' })));
    try {
      const res = await api('/api/admin/users');
      const users = res.users || [];

      const table = el('table', { class: 'file-list-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Member'),
            el('th', {}, 'Username'),
            el('th', {}, 'Role'),
            el('th', {}, 'Status'),
            el('th', { style: 'text-align: right;' }, 'Actions')
          )
        ),
        el('tbody', {})
      );

      const tbody = table.querySelector('tbody');
      for (const u of users) {
        const isSelf = u.id === state.me.id;
        const row = el('tr', {},
          el('td', { style: 'font-weight: 700; color: #fff;' }, u.displayName),
          el('td', {}, `@${u.username}`),
          el('td', {},
            el('span', { class: `embed-badge`, style: u.role === 'admin' ? 'background: #e53e3e;' : 'background: #5865f2;' }, u.role)
          ),
          el('td', {}, u.disabled ? 'Disabled' : 'Active'),
          el('td', { style: 'text-align: right;' },
            !isSelf ? el('button', {
              class: 'btn btn-secondary btn-sm',
              style: 'margin-right: 6px;',
              onclick: async () => {
                await api(`/api/admin/users/${u.id}`, {
                  method: 'PATCH',
                  body: { disabled: !u.disabled },
                });
                toast(`User ${u.disabled ? 'enabled' : 'disabled'}`);
                loadUsers();
              },
            }, u.disabled ? 'Enable' : 'Disable') : null,
            !isSelf ? el('button', {
              class: 'btn btn-danger btn-sm',
              onclick: async () => {
                if (confirm(`Permanently delete @${u.username}?`)) {
                  await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                  toast('User deleted');
                  loadUsers();
                }
              },
            }, 'Delete') : null
          )
        );
        tbody.append(row);
      }
      tableWrap.replaceChildren(table);
    } catch (e) {
      tableWrap.replaceChildren(el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, e.message)));
    }
  }

  // Create User Card
  const createCard = el('div', { class: 'discord-embed', style: 'margin-top: 24px;' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '➕'),
      el('span', { class: 'embed-title' }, 'Add New Household Member')
    ),
    el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;' },
      el('div', { class: 'field' },
        el('label', {}, 'DISPLAY NAME'),
        el('input', { id: 'new-u-disp', type: 'text', placeholder: 'e.g. Vinayak' })
      ),
      el('div', { class: 'field' },
        el('label', {}, 'USERNAME'),
        el('input', { id: 'new-u-user', type: 'text', placeholder: 'e.g. vinayak' })
      ),
      el('div', { class: 'field' },
        el('label', {}, 'INITIAL PASSWORD'),
        el('input', { id: 'new-u-pass', type: 'password', placeholder: 'Min 8 chars' })
      ),
      el('div', { class: 'field' },
        el('label', {}, 'ROLE'),
        el('select', { id: 'new-u-role' },
          el('option', { value: 'family' }, 'Family Member'),
          el('option', { value: 'guest' }, 'Guest'),
          el('option', { value: 'admin' }, 'Administrator')
        )
      )
    ),
    el('button', {
      class: 'btn btn-discord',
      onclick: async () => {
        const displayName = $('#new-u-disp').value.trim();
        const username = $('#new-u-user').value.trim();
        const password = $('#new-u-pass').value;
        const role = $('#new-u-role').value;
        if (!username || !password) return toast('Username and password required', true);
        try {
          await api('/api/admin/users', {
            method: 'POST',
            body: { displayName, username, password, role },
          });
          toast(`Created account @${username}`);
          $('#new-u-disp').value = '';
          $('#new-u-user').value = '';
          $('#new-u-pass').value = '';
          loadUsers();
        } catch (e) {
          toast(e.message, true);
        }
      },
    }, 'Create Member Account')
  );

  root.append(createCard);
  loadUsers();
  return root;
};

// --- VIEW 12: ALBUM PERMISSIONS (ADMIN ONLY) ---
VIEWS['album-permissions'] = async () => {
  if (state.me?.role !== 'admin') {
    return el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, 'Admins only.'));
  }
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '🔒'),
    el('h1', { class: 'channel-welcome-title' }, '#album-permissions'),
    el('p', { class: 'channel-welcome-desc' }, 'Grant or restrict family access to specific photo folders.')
  ));

  const listWrap = el('div', {});
  root.append(listWrap);

  try {
    const res = await api('/api/admin/albums');
    const albums = res.albums || [];

    for (const alb of albums) {
      const acl = alb.acl || { visibility: 'everyone' };
      const card = el('div', { class: 'discord-embed' },
        el('div', { class: 'embed-header' },
          el('span', { class: 'embed-icon' }, '📁'),
          el('span', { class: 'embed-title' }, alb.name),
          el('span', { class: 'embed-badge' }, acl.visibility.toUpperCase())
        ),
        el('div', { style: 'display: flex; gap: 12px; align-items: center; margin-top: 10px;' },
          el('span', { style: 'font-size: 13px; color: var(--text-muted);' }, 'Visibility:'),
          el('select', {
            id: `sel-acl-${alb.id}`,
            style: 'width: auto;',
            onchange: async (e) => {
              const val = e.target.value;
              await api(`/api/admin/albums/${alb.id}`, {
                method: 'PATCH',
                body: { visibility: val },
              });
              toast(`Album "${alb.name}" set to ${val}`);
            },
          },
          el('option', { value: 'everyone', selected: acl.visibility === 'everyone' }, 'Everyone (Public)'),
          el('option', { value: 'private', selected: acl.visibility === 'private' }, 'Private (Admin Only)')
          )
        )
      );
      listWrap.append(card);
    }
  } catch (e) {
    listWrap.replaceChildren(el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, e.message)));
  }

  return root;
};

// --- VIEW 13: SERVER SETTINGS (ADMIN ONLY) ---
VIEWS['server-settings'] = async () => {
  if (state.me?.role !== 'admin') {
    return el('div', { class: 'discord-embed embed-danger' }, el('div', { class: 'embed-body' }, 'Admins only.'));
  }
  const root = el('div', { class: 'content-inner' });

  root.append(el('div', { class: 'channel-welcome-banner' },
    el('div', { class: 'channel-welcome-icon' }, '🛠️'),
    el('h1', { class: 'channel-welcome-title' }, '#server-settings'),
    el('p', { class: 'channel-welcome-desc' }, 'Configure hub names, network proxy targets, and upload thresholds.')
  ));

  const set = (await api('/api/admin/settings')).settings || {};

  root.append(el('div', { class: 'discord-embed' },
    el('div', { class: 'embed-header' },
      el('span', { class: 'embed-icon' }, '⚙️'),
      el('span', { class: 'embed-title' }, 'Global Hub Parameters')
    ),
    el('div', { class: 'field' },
      el('label', {}, 'SERVER HUB NAME'),
      el('input', { id: 'cfg-hub-name', type: 'text', value: set.hubName || 'Peppy Home Hub' })
    ),
    el('div', { class: 'field' },
      el('label', {}, 'JELLYFIN LOCAL URL'),
      el('input', { id: 'cfg-jf-url', type: 'text', value: set.jellyfin?.url || 'http://127.0.0.1:8096' })
    ),
    el('div', { class: 'field' },
      el('label', {}, 'MAX FILE UPLOAD (MB)'),
      el('input', { id: 'cfg-max-mb', type: 'number', value: set.maxUploadMB || 2048 })
    ),
    el('button', {
      class: 'btn btn-discord',
      onclick: async () => {
        const hubName = $('#cfg-hub-name').value.trim();
        const jfUrl = $('#cfg-jf-url').value.trim();
        const maxMB = Number($('#cfg-max-mb').value);
        try {
          await api('/api/admin/settings', {
            method: 'PATCH',
            body: { hubName, jellyfin: { url: jfUrl }, maxUploadMB: maxMB },
          });
          toast('Settings saved successfully!');
          $('#hub-name').textContent = hubName;
        } catch (e) {
          toast(e.message, true);
        }
      },
    }, 'Save Changes')
  ));

  return root;
};

// ==========================================================================
// 12. Top-level Auto Bootstrap
// ==========================================================================
boot();
