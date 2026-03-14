const API = '';

// Redirect if already logged in
if (localStorage.getItem('fh_token')) {
  window.location.href = '/dashboard';
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('form-login').classList.toggle('active', isLogin);
  document.getElementById('form-register').classList.toggle('active', !isLogin);
  document.getElementById('auth-subtitle').textContent = isLogin
    ? 'Sign in to see your saved favorites.'
    : 'Create your free account to get started.';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Login failed.';
      errEl.classList.remove('hidden');
    } else {
      localStorage.setItem('fh_token', data.token);
      localStorage.setItem('fh_user', JSON.stringify(data.user));
      showToast('Welcome back, ' + data.user.username + '!', 'success');
      setTimeout(() => window.location.href = '/dashboard', 600);
    }
  } catch {
    errEl.textContent = 'Could not connect to server. Is it running?';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  const btn = document.getElementById('reg-btn');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Registration failed.';
      errEl.classList.remove('hidden');
    } else {
      localStorage.setItem('fh_token', data.token);
      localStorage.setItem('fh_user', JSON.stringify(data.user));
      showToast('Account created! Welcome, ' + data.user.username + '!', 'success');
      setTimeout(() => window.location.href = '/dashboard', 600);
    }
  } catch {
    errEl.textContent = 'Could not connect to server. Is it running?';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

/* ===== TOAST ===== */
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
  }, 3000);
}
