// Client Dashboard — orders list, new order modal, order detail panel
import { api, auth } from '../api.js';
import { icon, renderIcons } from '../icons.js';
import { showToast } from '../toast.js';
import { initSocket, subscribeToOrder, disconnectSocket } from '../socket.js';

let orders = [];
let selectedOrder = null;
let currentView = 'orders';

export function renderClientDashboard() {
    const app = document.getElementById('app');
    const user = auth.getUser();

    app.innerHTML = `
    ${renderSidebar(user)}
    <div class="dashboard-layout">
      ${renderHeader()}
      <main class="dashboard-content" id="dashboardMain">
        <div class="loading-center"><div class="spinner spinner-lg"></div></div>
      </main>
    </div>
    ${renderNewOrderModal()}
    <div class="order-detail" id="orderDetail"></div>
  `;

    renderIcons();
    initSocket();
    loadOrders();
    bindEvents();

    // Listen for real-time updates
    const orderUpdateHandler = () => loadOrders();
    document.addEventListener('swifttrack:order-update', orderUpdateHandler);
    document.addEventListener('swifttrack:notification', orderUpdateHandler);

    return () => {
        document.removeEventListener('swifttrack:order-update', orderUpdateHandler);
        document.removeEventListener('swifttrack:notification', orderUpdateHandler);
    };
}

function renderSidebar(user) {
    const initials = (user?.username || 'U').charAt(0).toUpperCase();
    return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h1>${icon('truck', 22)} SwiftTrack</h1>
        <p>Client Portal</p>
      </div>
      <nav class="sidebar-nav">
        <span class="nav-section-label">Menu</span>
        <button class="nav-item active" data-view="orders">
          ${icon('package', 18)}
          <span>Orders</span>
        </button>
        <button class="nav-item" data-view="tracking">
          ${icon('map-pin', 18)}
          <span>Tracking</span>
        </button>
        <button class="nav-item" data-view="analytics">
          ${icon('bar-chart-3', 18)}
          <span>Analytics</span>
        </button>
        <span class="nav-section-label">Account</span>
        <button class="nav-item" data-view="settings">
          ${icon('settings', 18)}
          <span>Settings</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="user-card">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <div class="user-name">${user?.username || 'User'}</div>
            <div class="user-role">${user?.role || 'client'}</div>
          </div>
          <button class="btn-ghost" id="logoutBtn" title="Sign out" style="padding:4px;">
            ${icon('log-out', 16)}
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderHeader() {
    return `
    <header class="dashboard-header">
      <h2 id="pageTitle">Orders</h2>
      <div class="header-actions">
        <div class="connection-status" id="connection-status">
          <span class="connection-dot"></span>
          <span class="connection-text">Connecting</span>
        </div>
        <button class="btn btn-primary btn-sm" id="newOrderBtn">
          ${icon('plus', 16)}
          <span>New Order</span>
        </button>
      </div>
    </header>
  `;
}

function renderNewOrderModal() {
    return `
    <div class="modal-overlay" id="newOrderModal">
      <div class="modal">
        <div class="modal-header">
          <h2>Create New Order</h2>
          <button class="modal-close" id="closeModal">${icon('x', 20)}</button>
        </div>
        <form id="orderForm">
          <div class="form-group">
            <label class="form-label">Item SKU</label>
            <input type="text" class="form-input" id="itemSku" placeholder="e.g. SKU-001" required />
          </div>
          <div class="form-group" style="margin-top:var(--space-4);">
            <label class="form-label">Quantity</label>
            <input type="number" class="form-input" id="itemQty" min="1" value="1" required />
          </div>
          <div class="form-group" style="margin-top:var(--space-4);">
            <label class="form-label">Price (LKR)</label>
            <input type="number" class="form-input" id="itemPrice" min="0" step="0.01" placeholder="0.00" required />
          </div>

          <span class="nav-section-label" style="display:block;margin-top:var(--space-6);">Delivery Address</span>

          <div class="form-group" style="margin-top:var(--space-3);">
            <label class="form-label">Street</label>
            <input type="text" class="form-input" id="addrStreet" placeholder="123 Main Street" required />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-top:var(--space-4);">
            <div class="form-group">
              <label class="form-label">City</label>
              <input type="text" class="form-input" id="addrCity" placeholder="Colombo" required />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <input type="text" class="form-input" id="addrState" placeholder="Western" required />
            </div>
          </div>
          <div class="form-group" style="margin-top:var(--space-4);">
            <label class="form-label">ZIP Code</label>
            <input type="text" class="form-input" id="addrZip" placeholder="10100" required />
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelOrder">Cancel</button>
            <button type="submit" class="btn btn-primary" id="submitOrder">
              ${icon('send', 16)}
              <span>Submit Order</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function loadOrders() {
    const main = document.getElementById('dashboardMain');
    try {
        const res = await api.getOrders();
        orders = res.data?.data || res.data || [];
        renderOrdersView(main);
    } catch (err) {
        console.error('Failed to load orders:', err);
        orders = [];
        renderOrdersView(main);
        // Don't show error toast if it's just service unavailable — show empty state instead
    }
}

function renderOrdersView(container) {
    const stats = computeStats();

    container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-icon teal">${icon('package', 20)}</div>
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total Orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon amber">${icon('clock', 20)}</div>
        <div class="stat-value">${stats.pending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon blue">${icon('truck', 20)}</div>
        <div class="stat-value">${stats.inTransit}</div>
        <div class="stat-label">In Transit</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon green">${icon('check-circle', 20)}</div>
        <div class="stat-value">${stats.delivered}</div>
        <div class="stat-label">Delivered</div>
      </div>
    </div>

    <div class="card" style="margin-top:var(--space-6);">
      <div class="card-header">
        <h3>${icon('list', 16)} Recent Orders</h3>
      </div>
      ${orders.length > 0 ? renderOrdersTable() : renderEmptyOrders()}
    </div>
  `;

    renderIcons();
}

function computeStats() {
    return {
        total: orders.length,
        pending: orders.filter(o => ['RECEIVED', 'PENDING'].includes(o.status)).length,
        inTransit: orders.filter(o => ['IN_TRANSIT', 'WMS_ASSIGNED', 'PROCESSING'].includes(o.status)).length,
        delivered: orders.filter(o => o.status === 'DELIVERED').length
    };
}

function renderOrdersTable() {
    return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr data-order-id="${o.orderId}" class="order-row">
              <td>${o.orderId}</td>
              <td>${o.items?.length || 0} item${(o.items?.length || 0) !== 1 ? 's' : ''}</td>
              <td>LKR ${(o.totalAmount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
              <td><span class="badge badge-${statusClass(o.status)}">${icon(statusIcon(o.status), 12)} ${formatStatus(o.status)}</span></td>
              <td>${formatDate(o.createdAt || o.metadata?.receivedAt)}</td>
              <td><button class="btn btn-ghost btn-sm view-order-btn" data-id="${o.orderId}">${icon('chevron-right', 16)}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyOrders() {
    return `
    <div class="empty-state">
      ${icon('inbox', 48)}
      <h3>No orders yet</h3>
      <p>Submit your first delivery order to get started with SwiftTrack.</p>
      <button class="btn btn-primary" style="margin-top:var(--space-5);" id="emptyNewOrderBtn">
        ${icon('plus', 16)} Create Order
      </button>
    </div>
  `;
}

function openOrderDetail(orderId) {
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return;

    selectedOrder = order;
    subscribeToOrder(orderId);

    const panel = document.getElementById('orderDetail');
    panel.innerHTML = `
    <div class="order-detail-header">
      <h3>${icon('file-text', 18)} ${order.orderId}</h3>
      <button class="modal-close" id="closeDetail">${icon('x', 20)}</button>
    </div>
    <div class="order-detail-body">
      <div class="detail-section">
        <div class="detail-section-title">Status</div>
        <span class="badge badge-${statusClass(order.status)}" style="font-size:var(--font-sm);padding:5px 14px;">
          ${icon(statusIcon(order.status), 14)} ${formatStatus(order.status)}
        </span>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Order Info</div>
        <div class="detail-row">
          <span class="detail-label">Customer ID</span>
          <span class="detail-value">${order.customerId}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Total Amount</span>
          <span class="detail-value">LKR ${(order.totalAmount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Created</span>
          <span class="detail-value">${formatDate(order.createdAt || order.metadata?.receivedAt)}</span>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Items</div>
        ${(order.items || []).map(item => `
          <div class="detail-row">
            <span class="detail-label">${item.sku} x${item.quantity}</span>
            <span class="detail-value">LKR ${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        `).join('')}
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Delivery Address</div>
        <div style="font-size:var(--font-sm);color:var(--text-secondary);line-height:1.7;">
          ${order.deliveryAddress?.street || '—'}<br/>
          ${order.deliveryAddress?.city || ''}, ${order.deliveryAddress?.state || ''}<br/>
          ${order.deliveryAddress?.zip || ''}
        </div>
      </div>

      ${order.statusHistory?.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-title">Timeline</div>
          <div class="timeline">
            ${order.statusHistory.slice().reverse().map((entry, i) => `
              <div class="timeline-item">
                <div class="timeline-marker">
                  <div class="timeline-dot ${i === 0 ? 'active' : ''}"></div>
                  <div class="timeline-line"></div>
                </div>
                <div class="timeline-content">
                  <div class="timeline-status">${formatStatus(entry.status)}</div>
                  <div class="timeline-meta">${entry.message || ''} &middot; ${formatDate(entry.timestamp)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

    panel.classList.add('open');
    renderIcons();

    document.getElementById('closeDetail').addEventListener('click', closeOrderDetail);
}

function closeOrderDetail() {
    const panel = document.getElementById('orderDetail');
    panel.classList.remove('open');
    selectedOrder = null;
}

function bindEvents() {
    // Sidebar nav
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const title = document.getElementById('pageTitle');
            if (title) title.textContent = btn.querySelector('span').textContent;
        });
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        auth.logout();
        disconnectSocket();
    });

    // New order modal
    const modal = document.getElementById('newOrderModal');
    document.getElementById('newOrderBtn')?.addEventListener('click', () => modal.classList.add('active'));
    document.getElementById('closeModal')?.addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('cancelOrder')?.addEventListener('click', () => modal.classList.remove('active'));

    // Close modal on overlay click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Submit order
    document.getElementById('orderForm')?.addEventListener('submit', handleSubmitOrder);

    // Order row clicks (delegated)
    document.getElementById('dashboardMain')?.addEventListener('click', (e) => {
        const row = e.target.closest('.order-row');
        const btn = e.target.closest('.view-order-btn');
        const emptyBtn = e.target.closest('#emptyNewOrderBtn');

        if (row) {
            openOrderDetail(row.dataset.orderId);
        } else if (btn) {
            openOrderDetail(btn.dataset.id);
        } else if (emptyBtn) {
            modal.classList.add('active');
        }
    });
}

async function handleSubmitOrder(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitOrder');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

    try {
        const orderData = {
            items: [{
                sku: document.getElementById('itemSku').value.trim(),
                quantity: parseInt(document.getElementById('itemQty').value),
                price: parseFloat(document.getElementById('itemPrice').value)
            }],
            deliveryAddress: {
                street: document.getElementById('addrStreet').value.trim(),
                city: document.getElementById('addrCity').value.trim(),
                state: document.getElementById('addrState').value.trim(),
                zip: document.getElementById('addrZip').value.trim()
            }
        };

        await api.createOrder(orderData);
        showToast('Order submitted successfully', 'success', 'Order Created');

        document.getElementById('newOrderModal').classList.remove('active');
        document.getElementById('orderForm').reset();
        await loadOrders();
    } catch (err) {
        showToast(err.message || 'Failed to submit order', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('send', 16)}<span>Submit Order</span>`;
        renderIcons();
    }
}

// Helpers
function statusClass(status) {
    const map = {
        'RECEIVED': 'received',
        'PENDING': 'pending',
        'PROCESSING': 'processing',
        'CMS_PROCESSED': 'processing',
        'ROS_OPTIMIZED': 'processing',
        'WMS_ASSIGNED': 'in-transit',
        'IN_TRANSIT': 'in-transit',
        'DELIVERED': 'delivered',
        'FAILED': 'failed',
        'CANCELLED': 'cancelled'
    };
    return map[status] || 'pending';
}

function statusIcon(status) {
    const map = {
        'RECEIVED': 'inbox',
        'PENDING': 'clock',
        'PROCESSING': 'loader',
        'CMS_PROCESSED': 'server',
        'ROS_OPTIMIZED': 'map',
        'WMS_ASSIGNED': 'warehouse',
        'IN_TRANSIT': 'truck',
        'DELIVERED': 'check-circle',
        'FAILED': 'alert-circle',
        'CANCELLED': 'x-circle'
    };
    return map[status] || 'circle';
}

function formatStatus(status) {
    return (status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
}
