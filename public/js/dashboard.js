/* ===== STATE ===== */
const token = localStorage.getItem('fh_token');
const user = JSON.parse(localStorage.getItem('fh_user') || 'null');

if (!token || !user) {
  window.location.href = '/';
}

let allFavorites = [];
let filteredFavorites = [];
let selectedIds = new Set();
let currentView = 'grid';
let currentFilter = 'all';
let currentSort = 'newest';
let currentSearch = '';
let currentCategory = null;
let currentStore = null;
let detailItemId = null;
let searchDebounceTimer = null;

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  initUserUI();
  loadFavorites();
  loadStats();
  initMobileSetup();
  document.addEventListener('click', handleOutsideClick);
});

function initUserUI() {
  const initials = user.username.slice(0, 2).toUpperCase();
  document.getElementById('user-avatar-initials').textContent = initials;
  document.getElementById('user-name-display').textContent = user.username;
  document.getElementById('menu-username').textContent = user.username;
  document.getElementById('menu-email').textContent = user.email;
}

/* ===== API HELPERS ===== */
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

/* ===== LOAD DATA ===== */
async function loadFavorites() {
  showLoading(true);
  try {
    const params = new URLSearchParams({ sort: currentSort });
    if (currentSearch) params.set('search', currentSearch);
    if (currentCategory) params.set('category', currentCategory);
    if (currentStore) params.set('store', currentStore);

    allFavorites = await api(`/favorites?${params}`);
    renderFavorites(allFavorites);
    updateToolbarCount(allFavorites.length);
  } catch (err) {
    showToast('Failed to load favorites: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadStats() {
  try {
    const stats = await api('/favorites/stats');
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-stores').textContent = stats.stores;
    document.getElementById('stat-categories').textContent = stats.categories.length;
    document.getElementById('count-all').textContent = stats.total;
    renderCategoryFilters(stats.categories);
    renderStoreFilters(stats.storeList);
  } catch {}
}

/* ===== RENDER ===== */
function renderFavorites(favs) {
  const container = document.getElementById('favorites-grid');
  container.innerHTML = '';

  if (!favs.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">❤️</div>
        <div class="empty-state-title">${currentSearch ? 'No results found' : 'No favorites yet'}</div>
        <div class="empty-state-sub">
          ${currentSearch
            ? `No items match "${currentSearch}". Try a different search.`
            : 'Use the browser extension to save items, or click "Add Item" to add manually.'}
        </div>
        ${!currentSearch ? `<button class="btn btn-primary" onclick="openAddModal()">+ Add Your First Item</button>` : ''}
      </div>`;
    return;
  }

  container.className = currentView === 'grid' ? 'favorites-grid' : 'favorites-list';

  favs.forEach(fav => {
    const el = currentView === 'grid' ? buildCardEl(fav) : buildRowEl(fav);
    container.appendChild(el);
  });
}

function buildCardEl(fav) {
  const div = document.createElement('div');
  div.className = `fav-card ${selectedIds.has(fav.id) ? 'selected' : ''}`;
  div.dataset.id = fav.id;

  const imgHtml = fav.image_url
    ? `<img class="fav-card-image" src="${escHtml(fav.image_url)}" alt="${escHtml(fav.title)}" onerror="this.parentElement.innerHTML='<div class=fav-card-image-placeholder>🛍️</div>'" />`
    : `<div class="fav-card-image-placeholder">🛍️</div>`;

  div.innerHTML = `
    <div class="fav-card-select" onclick="toggleSelect(event, '${fav.id}')">✓</div>
    ${fav.category && fav.category !== 'Uncategorized'
      ? `<span class="badge badge-brand fav-card-category-badge" style="font-size:0.65rem;">${escHtml(fav.category)}</span>`
      : ''}
    ${imgHtml}
    <div class="fav-card-body">
      <div class="fav-card-store">${escHtml(fav.store || 'Unknown')}</div>
      <div class="fav-card-title">${escHtml(fav.title)}</div>
      ${fav.price ? `<div class="fav-card-price">${escHtml(fav.price)}</div>` : ''}
      <div class="fav-card-meta">
        <span class="fav-card-date">${timeAgo(fav.added_at)}</span>
        <div class="fav-card-actions">
          <button class="fav-card-btn visit" title="Visit store" onclick="visitItem(event, '${escHtml(fav.product_url)}')">↗</button>
          <button class="fav-card-btn" title="Edit" onclick="openEditModal(event, '${fav.id}')">✏️</button>
          <button class="fav-card-btn delete" title="Delete" onclick="deleteItem(event, '${fav.id}')">🗑</button>
        </div>
      </div>
    </div>`;

  div.addEventListener('click', (e) => {
    if (!e.target.closest('.fav-card-btn') && !e.target.closest('.fav-card-select')) {
      openDetailModal(fav.id);
    }
  });
  return div;
}

function buildRowEl(fav) {
  const div = document.createElement('div');
  div.className = `fav-row ${selectedIds.has(fav.id) ? 'selected' : ''}`;
  div.dataset.id = fav.id;

  const thumbHtml = fav.image_url
    ? `<div class="fav-row-thumb"><img src="${escHtml(fav.image_url)}" alt="" onerror="this.parentElement.innerHTML='🛍️'" /></div>`
    : `<div class="fav-row-thumb">🛍️</div>`;

  div.innerHTML = `
    ${thumbHtml}
    <div class="fav-row-info">
      <div class="fav-row-title">${escHtml(fav.title)}</div>
      <div class="fav-row-store">${escHtml(fav.store || 'Unknown')}</div>
    </div>
    <div class="fav-row-price">${fav.price ? escHtml(fav.price) : '—'}</div>
    <div class="fav-row-date">${timeAgo(fav.added_at)}</div>
    <div class="fav-row-actions">
      <button class="fav-card-btn visit" title="Visit store" onclick="visitItem(event, '${escHtml(fav.product_url)}')">↗</button>
      <button class="fav-card-btn" title="Edit" onclick="openEditModal(event, '${fav.id}')">✏️</button>
      <button class="fav-card-btn delete" title="Delete" onclick="deleteItem(event, '${fav.id}')">🗑</button>
    </div>`;

  div.addEventListener('click', (e) => {
    if (!e.target.closest('.fav-card-btn')) {
      openDetailModal(fav.id);
    }
  });
  return div;
}

function renderCategoryFilters(categories) {
  const container = document.getElementById('category-filters');
  container.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `sidebar-item ${currentCategory === cat.category ? 'active' : ''}`;
    btn.id = `cat-${cat.category}`;
    btn.innerHTML = `
      <span class="sidebar-item-icon">📁</span>
      ${escHtml(cat.category)}
      <span class="sidebar-item-count">${cat.count}</span>`;
    btn.onclick = () => setCategoryFilter(cat.category);
    container.appendChild(btn);
  });
}

function renderStoreFilters(stores) {
  const container = document.getElementById('store-filters');
  container.innerHTML = '';
  stores.slice(0, 8).forEach(store => {
    const btn = document.createElement('button');
    btn.className = `sidebar-item ${currentStore === store ? 'active' : ''}`;
    btn.innerHTML = `<span class="sidebar-item-icon">🏪</span> ${escHtml(store)}`;
    btn.onclick = () => setStoreFilter(store);
    container.appendChild(btn);
  });
}

/* ===== FILTERS ===== */
function setFilter(filter) {
  currentFilter = filter;
  currentCategory = null;
  currentStore = null;

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`filter-${filter}`)?.classList.add('active');

  if (filter === 'recent') {
    currentSort = 'newest';
    document.getElementById('sort-select').value = 'newest';
    document.getElementById('toolbar-title').textContent = 'Added Recently';
  } else {
    document.getElementById('toolbar-title').textContent = 'All Favorites';
  }
  loadFavorites();
}

function setCategoryFilter(category) {
  // null means "clear" (used by mobile drawer)
  currentCategory = (category === null || currentCategory === category) ? null : category;
  currentStore = null;
  currentFilter = 'all';

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  if (currentCategory) {
    document.getElementById(`cat-${currentCategory}`)?.classList.add('active');
    document.getElementById('toolbar-title').textContent = currentCategory;
  } else {
    document.getElementById('filter-all')?.classList.add('active');
    document.getElementById('toolbar-title').textContent = 'All Favorites';
  }
  loadFavorites();
}

function setStoreFilter(store) {
  // null means "clear" (used by mobile drawer)
  currentStore = (store === null || currentStore === store) ? null : store;
  currentCategory = null;
  currentFilter = 'all';

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  if (currentStore) {
    document.getElementById('toolbar-title').textContent = currentStore;
  } else {
    document.getElementById('filter-all')?.classList.add('active');
    document.getElementById('toolbar-title').textContent = 'All Favorites';
  }
  loadFavorites();
}

function applySort(value) {
  currentSort = value;
  // Keep all sort selects in sync
  ['sort-select', 'mobile-sort-select', 'drawer-sort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
  loadFavorites();
}

function debouncedSearch(value) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentSearch = value;
    loadFavorites();
  }, 300);
}

/* ===== VIEW TOGGLE ===== */
function setView(view) {
  currentView = view;
  document.getElementById('view-grid').classList.toggle('active', view === 'grid');
  document.getElementById('view-list').classList.toggle('active', view === 'list');
  renderFavorites(allFavorites);
}

/* ===== SELECTION ===== */
function toggleSelect(e, id) {
  e.stopPropagation();
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card) card.classList.toggle('selected', selectedIds.has(id));
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (selectedIds.size > 0) {
    bar.classList.remove('hidden');
    document.getElementById('bulk-count-text').textContent = `${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} selected`;
  } else {
    bar.classList.add('hidden');
  }
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.fav-card.selected, .fav-row.selected').forEach(el => el.classList.remove('selected'));
  updateBulkBar();
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  const count = selectedIds.size;
  if (!confirm(`Delete ${count} item${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
  try {
    await api('/favorites', { method: 'DELETE', body: JSON.stringify({ ids: [...selectedIds] }) });
    selectedIds.clear();
    updateBulkBar();
    showToast(`Deleted ${count} item${count > 1 ? 's' : ''}.`, 'success');
    loadFavorites();
    loadStats();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

/* ===== ITEM ACTIONS ===== */
function visitItem(e, url) {
  e.stopPropagation();
  window.open(url, '_blank');
}

async function deleteItem(e, id) {
  e.stopPropagation();
  if (!confirm('Remove this item from your favorites?')) return;
  try {
    await api(`/favorites/${id}`, { method: 'DELETE' });
    showToast('Removed from favorites.', 'success');
    loadFavorites();
    loadStats();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

/* ===== ADD MODAL ===== */
function openAddModal() {
  document.getElementById('add-url').value = '';
  document.getElementById('add-title').value = '';
  document.getElementById('add-price').value = '';
  document.getElementById('add-store').value = '';
  document.getElementById('add-image').value = '';
  document.getElementById('add-category').value = 'Uncategorized';
  document.getElementById('add-notes').value = '';
  document.getElementById('add-error').classList.add('hidden');
  openModal('add-modal');
}

async function handleAddItem(e) {
  e.preventDefault();
  const btn = document.getElementById('add-submit-btn');
  const errEl = document.getElementById('add-error');
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await api('/favorites', {
      method: 'POST',
      body: JSON.stringify({
        product_url: document.getElementById('add-url').value.trim(),
        title: document.getElementById('add-title').value.trim(),
        price: document.getElementById('add-price').value.trim() || null,
        store: document.getElementById('add-store').value.trim() || null,
        image_url: document.getElementById('add-image').value.trim() || null,
        category: document.getElementById('add-category').value,
        notes: document.getElementById('add-notes').value.trim() || null,
      }),
    });
    closeModal('add-modal');
    showToast('Added to your favorites!', 'success');
    loadFavorites();
    loadStats();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to Favorites';
  }
}

/* ===== EDIT MODAL ===== */
async function openEditModal(e, id) {
  if (e) e.stopPropagation();
  closeModal('detail-modal');

  try {
    const fav = await api(`/favorites/${id}`);
    document.getElementById('edit-id').value = fav.id;
    document.getElementById('edit-title').value = fav.title;
    document.getElementById('edit-price').value = fav.price || '';
    document.getElementById('edit-category').value = fav.category || 'Uncategorized';
    document.getElementById('edit-image').value = fav.image_url || '';
    document.getElementById('edit-notes').value = fav.notes || '';
    document.getElementById('edit-error').classList.add('hidden');
    openModal('edit-modal');
  } catch (err) {
    showToast('Could not load item: ' + err.message, 'error');
  }
}

async function handleEditItem(e) {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const errEl = document.getElementById('edit-error');
  errEl.classList.add('hidden');

  try {
    await api(`/favorites/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: document.getElementById('edit-title').value.trim(),
        price: document.getElementById('edit-price').value.trim() || null,
        category: document.getElementById('edit-category').value,
        image_url: document.getElementById('edit-image').value.trim() || null,
        notes: document.getElementById('edit-notes').value.trim(),
      }),
    });
    closeModal('edit-modal');
    showToast('Changes saved!', 'success');
    loadFavorites();
    loadStats();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

/* ===== DETAIL MODAL ===== */
async function openDetailModal(id) {
  detailItemId = id;
  try {
    const fav = await api(`/favorites/${id}`);

    const imgHtml = fav.image_url
      ? `<img src="${escHtml(fav.image_url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='🛍️'" />`
      : '🛍️';

    document.getElementById('detail-content').innerHTML = `
      <div class="detail-image-wrap">${imgHtml}</div>
      <div class="detail-meta">
        <div class="detail-meta-row">
          <span class="detail-meta-label">Title</span>
          <span class="detail-meta-value" style="font-weight:700;">${escHtml(fav.title)}</span>
        </div>
        ${fav.price ? `
        <div class="detail-meta-row">
          <span class="detail-meta-label">Price</span>
          <span class="detail-price">${escHtml(fav.price)}</span>
        </div>` : ''}
        <div class="detail-meta-row">
          <span class="detail-meta-label">Store</span>
          <span class="detail-meta-value">${escHtml(fav.store || 'Unknown')}</span>
        </div>
        <div class="detail-meta-row">
          <span class="detail-meta-label">Category</span>
          <span class="detail-meta-value"><span class="badge badge-brand">${escHtml(fav.category || 'Uncategorized')}</span></span>
        </div>
        <div class="detail-meta-row">
          <span class="detail-meta-label">Added</span>
          <span class="detail-meta-value">${new Date(fav.added_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
        ${fav.notes ? `
        <div class="detail-meta-row" style="flex-direction:column; gap:6px;">
          <span class="detail-meta-label">Notes</span>
          <span style="font-size:0.875rem; color:var(--text-muted); line-height:1.6;">${escHtml(fav.notes)}</span>
        </div>` : ''}
      </div>`;

    document.getElementById('detail-visit-btn').href = fav.product_url;
    document.getElementById('detail-edit-btn').onclick = () => openEditModal(null, fav.id);
    document.getElementById('detail-delete-btn').onclick = async () => {
      if (!confirm('Remove this item?')) return;
      await deleteItem(new Event('click'), fav.id);
      closeModal('detail-modal');
    };

    openModal('detail-modal');
  } catch (err) {
    showToast('Could not load item: ' + err.message, 'error');
  }
}

/* ===== API TOKEN ===== */
function showApiToken() {
  document.getElementById('user-menu').classList.add('hidden');
  document.getElementById('token-display').textContent = token;
  openModal('token-modal');
}

function copyToken() {
  navigator.clipboard.writeText(token).then(() => {
    showToast('Token copied to clipboard!', 'success');
  });
}

/* ===== AUTH ===== */
function logout() {
  localStorage.removeItem('fh_token');
  localStorage.removeItem('fh_user');
  window.location.href = '/';
}

/* ===== USER MENU ===== */
function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('hidden');
}

function handleOutsideClick(e) {
  const menu = document.getElementById('user-menu');
  if (!menu.classList.contains('hidden') && !e.target.closest('.user-chip') && !e.target.closest('#user-menu')) {
    menu.classList.add('hidden');
  }
}

/* ===== MODAL HELPERS ===== */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.add('hidden');
  });
});

/* ===== UI HELPERS ===== */
function showLoading(show) {
  document.getElementById('loading-indicator').style.display = show ? 'flex' : 'none';
  document.getElementById('favorites-grid').style.display = show ? 'none' : '';
}

function updateToolbarCount(count) {
  document.getElementById('toolbar-count').textContent = `${count} item${count !== 1 ? 's' : ''}`;
}

/* ===== UTILS ===== */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ===== MOBILE SETUP ===== */
let pwaInstallPrompt = null;

// Capture the install prompt before the browser discards it
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaInstallPrompt = e;
});

function initMobileSetup() {
  const isMobile    = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const isIos       = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid   = /Android/i.test(navigator.userAgent);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const dismissed   = localStorage.getItem('fh_banner_dismissed');

  // Sidebar button opens the modal
  document.getElementById('mobile-setup-btn').addEventListener('click', openMobileModal);
  document.getElementById('mobile-modal-close').addEventListener('click', () => closeModal('mobile-modal'));
  document.getElementById('mobile-modal-close2').addEventListener('click', () => closeModal('mobile-modal'));

  // Install buttons
  document.getElementById('banner-install-btn').addEventListener('click', triggerInstall);
  document.getElementById('modal-install-btn').addEventListener('click', triggerInstall);

  // Banner dismiss
  document.getElementById('banner-dismiss-btn').addEventListener('click', () => {
    document.getElementById('mobile-banner').classList.add('hidden');
    localStorage.setItem('fh_banner_dismissed', '1');
  });

  // Auto-show banner on mobile if not installed and not dismissed
  if (isMobile && !isInstalled && !dismissed) {
    document.getElementById('mobile-banner').classList.remove('hidden');
  }
}

function openMobileModal() {
  const isIos     = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile  = isIos || isAndroid;

  // Show the right step list
  document.getElementById('steps-desktop').classList.toggle('hidden', isMobile);
  document.getElementById('steps-android').classList.toggle('hidden', !isAndroid);
  document.getElementById('steps-ios').classList.toggle('hidden', !isIos);

  // Show install button only if the browser has an install prompt ready
  document.getElementById('pwa-install-section').classList.toggle('hidden', !pwaInstallPrompt);

  openModal('mobile-modal');
}

async function triggerInstall() {
  if (!pwaInstallPrompt) return;
  pwaInstallPrompt.prompt();
  const { outcome } = await pwaInstallPrompt.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('mobile-banner').classList.add('hidden');
    document.getElementById('pwa-install-section').classList.add('hidden');
    pwaInstallPrompt = null;
    showToast('FavoritesHub installed! 🎉', 'success');
  }
}

/* ===== MOBILE NAV ===== */
let mobileSearchVisible = false;

function mobileNav(tab) {
  // Update active state
  ['all', 'search', 'filter', 'profile'].forEach(t => {
    document.getElementById(`mnav-${t}`)?.classList.toggle('active', t === tab);
  });

  if (tab === 'all') {
    hideMobileSearch();
    setFilter('all');
  } else if (tab === 'search') {
    toggleMobileSearch();
  } else if (tab === 'filter') {
    openMobileFilterDrawer();
  } else if (tab === 'profile') {
    toggleUserMenu();
  }
}

function toggleMobileSearch() {
  const bar = document.getElementById('mobile-search-bar');
  mobileSearchVisible = !mobileSearchVisible;
  bar.style.display = mobileSearchVisible ? 'flex' : 'none';
  if (mobileSearchVisible) {
    document.getElementById('mobile-search').focus();
  }
}

function hideMobileSearch() {
  const bar = document.getElementById('mobile-search-bar');
  bar.style.display = 'none';
  mobileSearchVisible = false;
}

/* ===== MOBILE FILTER DRAWER ===== */
let drawerCategories = [];
let drawerStores = [];

function openMobileFilterDrawer() {
  populateDrawerFilters();
  document.getElementById('filter-drawer-backdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeMobileFilterDrawer() {
  document.getElementById('filter-drawer-backdrop').classList.add('hidden');
  document.body.style.overflow = '';
}

function populateDrawerFilters() {
  const catContainer   = document.getElementById('drawer-category-list');
  const storeContainer = document.getElementById('drawer-store-list');

  // Re-use cached data from allFavorites
  const cats   = [...new Set(allFavorites.map(f => f.category).filter(Boolean))];
  const stores = [...new Set(allFavorites.map(f => f.store).filter(Boolean))].slice(0, 12);

  catContainer.innerHTML = '';
  ['all', ...cats].forEach(cat => {
    const chip = document.createElement('button');
    chip.className = `filter-chip${(cat === 'all' ? !currentCategory : currentCategory === cat) ? ' active' : ''}`;
    chip.textContent = cat === 'all' ? '✦ All' : cat;
    chip.onclick = () => {
      if (cat === 'all') { setCategoryFilter(null); } else { setCategoryFilter(cat); }
      closeMobileFilterDrawer();
    };
    catContainer.appendChild(chip);
  });

  storeContainer.innerHTML = '';
  ['all', ...stores].forEach(store => {
    const chip = document.createElement('button');
    chip.className = `filter-chip${(store === 'all' ? !currentStore : currentStore === store) ? ' active' : ''}`;
    chip.textContent = store === 'all' ? '✦ All' : store;
    chip.onclick = () => {
      if (store === 'all') { setStoreFilter(null); } else { setStoreFilter(store); }
      closeMobileFilterDrawer();
    };
    storeContainer.appendChild(chip);
  });

  // Sync drawer sort
  document.getElementById('drawer-sort').value = currentSort;
}

// Close drawer on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filter-drawer-backdrop')?.addEventListener('click', e => {
    if (e.target === document.getElementById('filter-drawer-backdrop')) closeMobileFilterDrawer();
  });
  document.getElementById('filter-drawer-close')?.addEventListener('click', closeMobileFilterDrawer);

  // Also sync the mobile search input with desktop search
  const mobileSearch = document.getElementById('mobile-search');
  if (mobileSearch) {
    mobileSearch.addEventListener('input', e => debouncedSearch(e.target.value));
  }
});
