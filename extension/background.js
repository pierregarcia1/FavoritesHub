// FavoritesHub — Background Service Worker
// Handles all API communication so content scripts don't need cross-origin permissions.

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['serverUrl'], (result) => {
    if (!result.serverUrl) {
      chrome.storage.sync.set({ serverUrl: 'http://localhost:3000' });
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'saveFavorite') {
    handleSaveFavorite(message.data).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (message.action === 'checkConnection') {
    handleCheckConnection().then(sendResponse);
    return true;
  }
  if (message.action === 'getStats') {
    handleGetStats().then(sendResponse);
    return true;
  }
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverUrl', 'token'], resolve);
  });
}

async function handleSaveFavorite(data) {
  const { serverUrl, token } = await getSettings();

  if (!token) {
    return { success: false, notConfigured: true };
  }

  try {
    const res = await fetch(`${serverUrl}/api/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const body = await res.json();

    if (res.status === 409) {
      return { success: false, alreadySaved: true, id: body.id };
    }
    if (!res.ok) {
      return { success: false, error: body.error || 'Server error.' };
    }
    return { success: true, favorite: body };
  } catch (err) {
    if (err.message.includes('fetch')) {
      return { success: false, error: 'Cannot reach FavoritesHub server. Is it running?' };
    }
    return { success: false, error: err.message };
  }
}

async function handleCheckConnection() {
  const { serverUrl, token } = await getSettings();
  if (!token) return { ok: false, notConfigured: true };

  try {
    const res = await fetch(`${serverUrl}/api/health`);
    if (!res.ok) return { ok: false, error: 'Server returned an error.' };

    const meRes = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!meRes.ok) return { ok: false, error: 'Invalid token. Please re-paste from the website.' };

    const user = await meRes.json();
    return { ok: true, user };
  } catch {
    return { ok: false, error: 'Cannot connect to server.' };
  }
}

async function handleGetStats() {
  const { serverUrl, token } = await getSettings();
  if (!token) return null;

  try {
    const res = await fetch(`${serverUrl}/api/favorites/stats`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
