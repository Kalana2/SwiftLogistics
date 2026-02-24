// Driver Dashboard — delivery manifest, status updates
import { api, auth } from '../api.js';
import { icon, renderIcons } from '../icons.js';
import { showToast } from '../toast.js';
import { initSocket, disconnectSocket } from '../socket.js';

let deliveries = [];

export function renderDriverDashboard() {
    const app = document.getElementById('app');
    const user = auth.getUser();

    app.innerHTML = `
    ${renderDriverSidebar(user)}
    <div class="dashboard-layout">
      ${renderDriverHeader()}
      <main class="dashboard-content" id="driverMain">
        <div class="loading-center"><div class="spinner spinner-lg"></div></div>
      </main>
    </div>
  `;

    renderIcons();
    initSocket();
    loadManifest();
    bindDriverEvents();

    // Listen for real-time route updates
    const driverUpdateHandler = () => loadManifest();
    document.addEventListener('swifttrack:driver-update', driverUpdateHandler);
    document.addEventListener('swifttrack:order-update', driverUpdateHandler);

    return () => {
        document.removeEventListener('swifttrack:driver-update', driverUpdateHandler);
        document.removeEventListener('swifttrack:order-update', driverUpdateHandler);
    };
}

function renderDriverSidebar(user) {
    const initials = (user?.username || 'D').charAt(0).toUpperCase();
    return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h1>${icon('truck', 22)} SwiftTrack</h1>
        <p>Driver App</p>
      </div>
      <nav class="sidebar-nav">
        <span class="nav-section-label">Navigation</span>
        <button class="nav-item active" data-view="manifest">
          ${icon('clipboard-list', 18)}
          <span>Manifest</span>
        </button>
        <button class="nav-item" data-view="completed">
          ${icon('check-square', 18)}
          <span>Completed</span>
        </button>
        <button class="nav-item" data-view="route">
          ${icon('navigation', 18)}
          <span>Route Map</span>
        </button>
        <span class="nav-section-label">Account</span>
        <button class="nav-item" data-view="profile">
          ${icon('user', 18)}
          <span>Profile</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="user-card">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <div class="user-name">${user?.username || 'Driver'}</div>
            <div class="user-role">Driver</div>
          </div>
          <button class="btn-ghost" id="driverLogoutBtn" title="Sign out" style="padding:4px;">
            ${icon('log-out', 16)}
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderDriverHeader() {
    return `
    <header class="dashboard-header">
      <h2>Today's Manifest</h2>
      <div class="header-actions">
        <div class="connection-status" id="connection-status">
          <span class="connection-dot"></span>
          <span class="connection-text">Connecting</span>
        </div>
        <button class="btn btn-secondary btn-sm" id="refreshManifest">
          ${icon('refresh-cw', 16)}
          <span>Refresh</span>
        </button>
      </div>
    </header>
  `;
}

async function loadManifest() {
    const main = document.getElementById('driverMain');
    try {
        const res = await api.getManifest();
        deliveries = res.data?.deliveries || [];
        renderManifestView(main, res.data);
    } catch (err) {
        console.error('Failed to load manifest:', err);
        deliveries = [];
        renderManifestView(main, { deliveryCount: 0, deliveries: [] });
    }
}

function renderManifestView(container, data) {
    const completed = deliveries.filter(d => d.status === 'DELIVERED').length;
    const pending = deliveries.filter(d => d.status !== 'DELIVERED' && d.status !== 'FAILED').length;
    const failed = deliveries.filter(d => d.status === 'FAILED').length;

    container.innerHTML = `
    <div class="driver-stats">
      <div class="stat-card">
        <div class="stat-card-icon blue">${icon('clipboard-list', 20)}</div>
        <div class="stat-value">${deliveries.length}</div>
        <div class="stat-label">Total Deliveries</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon amber">${icon('clock', 20)}</div>
        <div class="stat-value">${pending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon green">${icon('check-circle', 20)}</div>
        <div class="stat-value">${completed}</div>
        <div class="stat-label">Completed</div>
      </div>
    </div>

    ${deliveries.length > 0 ? renderDeliveryCards() : renderEmptyManifest()}
  `;

    renderIcons();
}

function renderDeliveryCards() {
    return `
    <div class="card" style="margin-bottom:var(--space-4);">
      <div class="card-header">
        <h3>${icon('package', 16)} Assigned Deliveries</h3>
      </div>
    </div>
    <div class="manifest-grid">
      ${deliveries.map(d => `
        <div class="delivery-card" data-order-id="${d.orderId}">
          <div class="delivery-card-header">
            <span class="delivery-order-id">${icon('hash', 14)} ${d.orderId}</span>
            <span class="badge badge-${getDeliveryStatusClass(d.status)}">${formatStatus(d.status)}</span>
          </div>
          <div class="delivery-address">
            ${icon('map-pin', 14)}
            <span>${d.deliveryAddress?.street || '—'}, ${d.deliveryAddress?.city || ''} ${d.deliveryAddress?.zip || ''}</span>
          </div>
          <div class="delivery-items">
            ${icon('package', 12)} ${d.items?.length || 0} item${(d.items?.length || 0) !== 1 ? 's' : ''}
            ${d.estimatedDelivery ? ` &middot; ${icon('clock', 12)} ETA: ${formatTime(d.estimatedDelivery)}` : ''}
          </div>
          <div class="delivery-actions">
            ${d.status !== 'DELIVERED' && d.status !== 'FAILED' ? `
              <button class="btn btn-primary btn-sm deliver-btn" data-id="${d.orderId}">
                ${icon('check', 14)} Delivered
              </button>
              <button class="btn btn-danger btn-sm fail-btn" data-id="${d.orderId}">
                ${icon('x', 14)} Failed
              </button>
            ` : `
              <span style="font-size:var(--font-xs);color:var(--text-muted);">
                ${d.status === 'DELIVERED' ? 'Completed' : 'Marked as failed'}
              </span>
            `}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderEmptyManifest() {
    return `
    <div class="empty-state">
      ${icon('coffee', 48)}
      <h3>No deliveries assigned</h3>
      <p>You don't have any deliveries scheduled for today. Check back later or contact dispatch.</p>
    </div>
  `;
}

function bindDriverEvents() {
    // Logout
    document.getElementById('driverLogoutBtn')?.addEventListener('click', () => {
        auth.logout();
        disconnectSocket();
    });

    // Refresh
    document.getElementById('refreshManifest')?.addEventListener('click', loadManifest);

    // Sidebar nav
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Delivery actions (delegated)
    document.getElementById('driverMain')?.addEventListener('click', async (e) => {
        const deliverBtn = e.target.closest('.deliver-btn');
        const failBtn = e.target.closest('.fail-btn');

        if (deliverBtn) {
            await updateStatus(deliverBtn.dataset.id, 'DELIVERED', 'Package delivered successfully');
        } else if (failBtn) {
            await updateStatus(failBtn.dataset.id, 'FAILED', 'Delivery attempt failed — recipient not available');
        }
    });
}

async function updateStatus(orderId, status, notes) {
    try {
        await api.updateDeliveryStatus(orderId, status, notes);
        showToast(
            status === 'DELIVERED' ? 'Delivery confirmed' : 'Delivery marked as failed',
            status === 'DELIVERED' ? 'success' : 'warning',
            orderId
        );
        await loadManifest();
    } catch (err) {
        showToast(err.message || 'Failed to update status', 'error');
    }
}

// Helpers
function getDeliveryStatusClass(status) {
    const map = {
        'WMS_ASSIGNED': 'pending',
        'IN_TRANSIT': 'in-transit',
        'DELIVERED': 'delivered',
        'FAILED': 'failed'
    };
    return map[status] || 'pending';
}

function formatStatus(status) {
    return (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
}
