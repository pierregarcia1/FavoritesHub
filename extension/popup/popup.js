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
  const urlEl   = document.getElementById('quick-url');
  const thumbEl = document.getElementById('quick-thumb');

  titleEl.textContent = tab.title || 'Untitled page';

  let hostname = '';
  try {
    hostname = new URL(tab.url).hostname.replace('www.', '');
    urlEl.textContent = hostname;
  } catch {
    urlEl.textContent = tab.url;
  }

  // Google's favicon service at 64 px — much crisper than tab.favIconUrl (16 px).
  if (hostname) {
    const src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    thumbEl.innerHTML = `<img src="${src}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:contain;" onerror="this.parentElement.textContent='🌐'" />`;
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

  // Inject a small extraction function directly into the tab to read OG image,
  // price, and title from the live DOM. More reliable than message-passing to
  // the content script, which may not have loaded yet or may have exited early.
  let pageData = null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const meta = (prop) =>
          document.querySelector(`meta[property="${prop}"]`)?.content ||
          document.querySelector(`meta[name="${prop}"]`)?.content ||
          null;

        // ── Image ──────────────────────────────────────────────────
        const image_url = meta('og:image') || meta('twitter:image') || null;

        // ── Price ──────────────────────────────────────────────────
        let price = null;

        // Helper: get trimmed text or content-attr value from first match
        const getText = (sel) => {
          try {
            const el = document.querySelector(sel);
            if (!el) return null;
            const val = (el.getAttribute('content') || el.textContent || '').replace(/\s+/g, ' ').trim();
            return val || null;
          } catch { return null; }
        };

        // 1. Schema.org itemprop (handles both content-attr and text)
        price = getText('[itemprop="price"]');

        // 2. JSON-LD Product.offers
        if (!price) {
          for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
              const data = JSON.parse(el.textContent);
              const nodes = Array.isArray(data) ? data : [data];
              const product = nodes.find((n) => n?.['@type'] === 'Product');
              if (product?.offers) {
                const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
                const amt = offer?.price;
                if (amt != null) {
                  const sym = offer?.priceCurrency === 'USD' ? '$' : (offer?.priceCurrency || '$') + ' ';
                  price = sym + amt;
                  break;
                }
              }
            } catch { /* malformed JSON-LD */ }
          }
        }

        // 3. OG price meta
        if (!price) {
          const ogAmt = meta('og:price:amount');
          if (ogAmt) price = '$' + ogAmt;
        }

        // 4. Site-specific and widely-used CSS selectors.
        //    Each candidate must contain at least one digit to be considered a price.
        if (!price) {
          const priceSelectors = [
            // Amazon
            '.a-price:first-of-type .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice',
            // eBay
            '.x-price-primary .ux-textspans', '#prcIsum',
            // Etsy
            '[data-selector="price-only"] .currency-value',
            // Target
            '[data-test="product-price"]',
            // Walmart
            '.price-characteristic',
            // Best Buy
            '.priceView-customer-price span:first-child',
            // Abercrombie / Hollister
            '[data-auto-id="product-price"]',
            // H&M
            '[class*="price-value"]',
            // Nike
            '[data-testid="currentPrice-container"]',
            // ASOS
            '[data-testid="current-price"] span',
            // Zara
            '.price__amount',
            // Newegg
            '.price-current strong',
            // Urban Outfitters
            '[data-qa="product-price"]',
            // Generic data attributes (works on many Shopify / custom stores)
            '[data-testid*="price"]', '[data-test*="price"]',
            '[data-price]',
            // Generic class patterns
            '[class*="product-price"]', '[class*="sale-price"]',
            '[class*="current-price"]', '[class*="selling-price"]',
            '[class*="offer-price"]',
          ];
          for (const sel of priceSelectors) {
            const text = getText(sel);
            if (text && /\d/.test(text)) { price = text; break; }
          }
        }

        // ── Title ──────────────────────────────────────────────────
        const title = meta('og:title') || meta('twitter:title') || document.title || null;

        return { image_url, price, title };
      },
    });
    pageData = result?.result ?? null;
  } catch { /* tab is a chrome:// page or other restricted URL — pageData stays null */ }

  // Derive store name from URL if content script didn't provide one.
  let store = pageData?.store;
  if (!store) {
    try {
      const hostname = new URL(tab.url).hostname.replace('www.', '');
      const parts    = hostname.split('.');
      const name     = parts.length >= 2 ? parts[parts.length - 2] : hostname;
      store = name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      store = 'Unknown';
    }
  }

  const result = await sendMessage({
    action: 'saveFavorite',
    data: {
      title:       pageData?.title       || tab.title || 'Untitled',
      product_url: tab.url,
      store,
      // Use the real OG / product image when available.
      // Never use tab.favIconUrl — it's 16 px and renders pixelated on the dashboard.
      image_url:   pageData?.image_url   || null,
      price:       pageData?.price       || null,
      category:    'Uncategorized',
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
