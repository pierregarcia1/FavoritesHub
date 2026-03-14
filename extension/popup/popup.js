let isSettingsOpen = false;
let currentUser = null;
let serverUrl = 'http://localhost:3000';

// ──────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await getSettings();
  serverUrl = settings.serverUrl || 'http://localhost:3000';

  document.getElementById('server-url').value = serverUrl;
  if (settings.token) {
    document.getElementById('api-token').value = settings.token;
  }

  // Wire up all button listeners here (inline onclick is blocked by extension CSP)
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('back-btn').addEventListener('click', goBack);
  document.getElementById('toggle-pw').addEventListener('click', togglePw);
  document.getElementById('quick-save-btn').addEventListener('click', quickSave);
  document.getElementById('settings-toggle').addEventListener('click', toggleSettings);

  // Check connection status
  checkConnection();

  // Load current tab info for quick save
  loadCurrentTab();
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverUrl', 'token'], resolve);
  });
}

// ──────────────────────────────────────────────────────────────
// CONNECTION CHECK
// ──────────────────────────────────────────────────────────────
async function checkConnection() {
  const dot = document.getElementById('status-dot');
  dot.className = 'status-dot';
  dot.title = 'Checking connection…';

  const settings = await getSettings();
  if (!settings.token) {
    showSetupView();
    dot.className = 'status-dot err';
    dot.title = 'Not configured';
    return;
  }

  const result = await sendMessage({ action: 'checkConnection' });

  if (result?.ok) {
    dot.className = 'status-dot ok';
    dot.title = `Connected as ${result.user.username}`;
    currentUser = result.user;
    showMainView(result.user, settings.serverUrl);
    loadStats();
  } else {
    dot.className = 'status-dot err';
    dot.title = result?.error || 'Not connected';
    if (result?.notConfigured) {
      showSetupView();
    } else {
      showSetupView(result?.error || 'Connection failed. Check your token and server URL.');
    }
  }
}

// ──────────────────────────────────────────────────────────────
// VIEWS
// ──────────────────────────────────────────────────────────────
function showMainView(user, url) {
  document.getElementById('view-main').classList.remove('hidden');
  document.getElementById('view-setup').classList.add('hidden');

  const initials = user.username.slice(0, 2).toUpperCase();
  document.getElementById('user-banner-avatar').textContent = initials;
  document.getElementById('user-banner-name').textContent = user.username;
  document.getElementById('user-banner-sub').textContent = '✓ Connected';

  const siteUrl = (url || 'http://localhost:3000').replace(/\/$/, '');
  document.getElementById('open-site-btn').href = siteUrl + '/dashboard';
}

function showSetupView(errorMsg) {
  document.getElementById('view-main').classList.add('hidden');
  document.getElementById('view-setup').classList.remove('hidden');

  const backBtn = document.getElementById('back-btn');
  backBtn.classList.toggle('hidden', !currentUser);

  if (errorMsg) {
    const errEl = document.getElementById('setup-error');
    errEl.textContent = '❌ ' + errorMsg;
    errEl.classList.remove('hidden');
  }
}

function toggleSettings() {
  isSettingsOpen = !isSettingsOpen;
  if (isSettingsOpen) {
    showSetupView();
  } else {
    checkConnection();
  }
}

function goBack() {
  if (currentUser) {
    document.getElementById('view-setup').classList.add('hidden');
    document.getElementById('view-main').classList.remove('hidden');
    isSettingsOpen = false;
  }
}

// ──────────────────────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────────────────────
async function saveSettings() {
  const btn = document.getElementById('save-settings-btn');
  const errEl = document.getElementById('setup-error');
  const url = document.getElementById('server-url').value.trim().replace(/\/$/, '');
  const token = document.getElementById('api-token').value.trim();

  errEl.classList.add('hidden');

  if (!url) {
    errEl.textContent = '❌ Server URL is required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!token) {
    errEl.textContent = '❌ API token is required.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connecting…';

  await chrome.storage.sync.set({ serverUrl: url, token });
  serverUrl = url;

  const result = await sendMessage({ action: 'checkConnection' });

  btn.disabled = false;
  btn.textContent = 'Connect';

  if (result?.ok) {
    currentUser = result.user;
    document.getElementById('status-dot').className = 'status-dot ok';
    document.getElementById('status-dot').title = `Connected as ${result.user.username}`;
    showMainView(result.user, url);
    loadStats();
    loadCurrentTab();
    isSettingsOpen = false;
  } else {
    errEl.textContent = '❌ ' + (result?.error || 'Could not connect. Check your URL and token.');
    errEl.classList.remove('hidden');
  }
}

function togglePw() {
  const input = document.getElementById('api-token');
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ──────────────────────────────────────────────────────────────
// STATS
// ──────────────────────────────────────────────────────────────
async function loadStats() {
  const stats = await sendMessage({ action: 'getStats' });
  if (!stats) return;
  document.getElementById('stat-total').textContent = stats.total ?? '—';
  document.getElementById('stat-stores').textContent = stats.stores ?? '—';
  document.getElementById('stat-cats').textContent = stats.categories?.length ?? '—';
}

// ──────────────────────────────────────────────────────────────
// QUICK SAVE
// ──────────────────────────────────────────────────────────────
async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const titleEl = document.getElementById('quick-title');
  const urlEl = document.getElementById('quick-url');
  const thumbEl = document.getElementById('quick-thumb');

  titleEl.textContent = tab.title || 'Untitled page';
  try {
    const url = new URL(tab.url);
    urlEl.textContent = url.hostname.replace('www.', '');
  } catch {
    urlEl.textContent = tab.url;
  }

  // Try to get favicon
  if (tab.favIconUrl) {
    thumbEl.innerHTML = `<img src="${tab.favIconUrl}" alt="" onerror="this.parentElement.textContent='🌐'" />`;
  }
}

async function quickSave() {
  const btn = document.getElementById('quick-save-btn');
  const statusEl = document.getElementById('quick-status');

  statusEl.className = 'status-msg hidden';
  statusEl.textContent = '';
  btn.disabled = true;
  btn.textContent = '⏳ Saving…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showQuickStatus('error', '❌ Cannot determine the current page URL.');
    btn.disabled = false;
    btn.innerHTML = '❤️ Save Current Page';
    return;
  }

  let hostname;
  try {
    hostname = new URL(tab.url).hostname.replace('www.', '');
    const parts = hostname.split('.');
    hostname = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    hostname = hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    hostname = 'Unknown';
  }

  const result = await sendMessage({
    action: 'saveFavorite',
    data: {
      title: tab.title || 'Untitled',
      product_url: tab.url,
      store: hostname,
      image_url: tab.favIconUrl || null,
      category: 'Uncategorized',
    },
  });

  btn.disabled = false;
  btn.innerHTML = '❤️ Save Current Page';

  if (result?.success) {
    showQuickStatus('success', '✅ Saved to FavoritesHub!');
    loadStats();
  } else if (result?.alreadySaved) {
    showQuickStatus('info', 'ℹ️ Already in your favorites!');
  } else if (result?.notConfigured) {
    showQuickStatus('error', '⚙️ Please configure your API token first.');
  } else {
    showQuickStatus('error', '❌ ' + (result?.error || 'Failed to save.'));
  }
}

function showQuickStatus(type, msg) {
  const el = document.getElementById('quick-status');
  el.className = `status-msg status-${type}`;
  el.textContent = msg;
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(response);
    });
  });
}
