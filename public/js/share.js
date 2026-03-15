const token = localStorage.getItem('fh_token');
const user  = JSON.parse(localStorage.getItem('fh_user') || 'null');

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Parse shared data from URL params ────────────────────────
const params  = new URLSearchParams(window.location.search);
const sharedUrl   = params.get('url')   || '';
const sharedTitle = params.get('title') || params.get('text') || '';

// ── Extract store name from URL ───────────────────────────────
function extractStore(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    const name = parts.length >= 2 ? parts[parts.length - 2] : hostname;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Unknown';
  }
}

// ── Show the right view ───────────────────────────────────────
function show(id) {
  ['view-login', 'view-save', 'view-success', 'view-duplicate'].forEach((v) => {
    document.getElementById(v).classList.add('hidden');
  });
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  el.style.display = 'flex';
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!token || !user) {
    show('view-login');
    return;
  }

  if (!sharedUrl) {
    // Nothing was shared — just go to dashboard
    window.location.href = '/dashboard';
    return;
  }

  const store = extractStore(sharedUrl);

  // Populate product card
  document.getElementById('share-store').textContent = store;
  document.getElementById('share-title').textContent = sharedTitle || 'Shared item';
  document.getElementById('share-url-display').textContent = sharedUrl;

  // Try to load OG image via fetch (best effort)
  loadFavicon(sharedUrl, store);

  show('view-save');

  document.getElementById('share-save-btn').addEventListener('click', saveItem);
});

async function loadFavicon(url, store) {
  try {
    const hostname = new URL(url).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    const thumb = document.getElementById('share-thumb');
    const img = document.createElement('img');
    img.src = faviconUrl;
    img.onerror = () => { thumb.textContent = '🛍️'; };
    img.onload = () => { thumb.innerHTML = ''; thumb.appendChild(img); };
  } catch {}
}

async function saveItem() {
  const btn      = document.getElementById('share-save-btn');
  const errEl    = document.getElementById('share-error');
  const category = document.getElementById('share-category').value;
  const notes    = document.getElementById('share-notes').value.trim();

  btn.disabled = true;
  btn.textContent = 'Saving…';
  errEl.classList.add('hidden');

  const payload = {
    title:       sharedTitle || 'Shared item',
    product_url: sharedUrl,
    store:       extractStore(sharedUrl),
    category,
    notes:       notes || null,
  };

  try {
    const res  = await fetch('/api/favorites', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.status === 409) {
      show('view-duplicate');
    } else if (res.ok) {
      show('view-success');
    } else {
      errEl.textContent = data.error || 'Failed to save. Please try again.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = '❤️ Save to FavoritesHub';
    }
  } catch {
    errEl.textContent = 'Could not reach the server. Check your connection.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = '❤️ Save to FavoritesHub';
  }
}
