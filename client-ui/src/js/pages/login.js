// Login page
import { api, auth } from '../api.js';
import { icon, renderIcons } from '../icons.js';
import { showToast } from '../toast.js';
import { navigate } from '../router.js';

export function renderLogin() {
    const app = document.getElementById('app');

    app.innerHTML = `
    <div class="login-page">
      <div class="login-container">
        <div class="login-header">
          <div class="login-logo">
            ${icon('truck', 28)}
            <h1>SwiftTrack</h1>
          </div>
          <p>Logistics management platform</p>
        </div>

        <div class="login-card">
          <form class="login-form" id="loginForm">
            <div class="form-group">
              <label class="form-label" for="email">Email address</label>
              <input
                type="email"
                id="email"
                class="form-input"
                placeholder="Enter your email"
                required
                autocomplete="email"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="password">Password</label>
              <input
                type="password"
                id="password"
                class="form-input"
                placeholder="Enter your password"
                required
                autocomplete="current-password"
              />
            </div>

            <div id="loginError" class="form-error" style="display:none;"></div>

            <button type="submit" class="btn btn-primary btn-lg" id="loginBtn">
              ${icon('log-in', 18)}
              <span>Sign In</span>
            </button>
          </form>

          <div class="login-divider">Demo accounts</div>

          <div class="login-hint">
            <strong>Client:</strong> <code>client@swifttrack.com</code> / <code>client123</code><br/>
            <strong>Driver:</strong> <code>driver@swifttrack.com</code> / <code>driver123</code><br/>
            <strong>Admin:</strong> <code>admin@swifttrack.com</code> / <code>admin123</code>
          </div>
        </div>
      </div>
    </div>
  `;

    renderIcons();

    // Form handler
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            errorEl.textContent = 'Please fill in all fields';
            errorEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Signing in...';

        try {
            const res = await api.login(email, password);
            auth.setToken(res.token);
            auth.setUser(res.user);

            showToast('Welcome back!', 'success', 'Signed in');

            if (res.user.role === 'driver') {
                navigate('/driver');
            } else {
                navigate('/dashboard');
            }
        } catch (err) {
            errorEl.textContent = err.message || 'Invalid credentials';
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = `${icon('log-in', 18)}<span>Sign In</span>`;
            renderIcons();
        }
    });
}
