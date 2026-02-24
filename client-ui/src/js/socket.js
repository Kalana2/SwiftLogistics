// Socket.io wrapper — gracefully degrades if Socket.io CDN is unavailable

import { auth } from './api.js';
import { showToast } from './toast.js';

let socket = null;

export function initSocket() {
    if (socket) return socket;

    // Check if Socket.io loaded from CDN
    if (!window.io) {
        console.warn('[Socket] Socket.io not available — real-time notifications disabled');
        updateConnectionStatus(false);
        return null;
    }

    const NOTIFICATION_URL = 'http://localhost:3005';

    try {
        socket = window.io(NOTIFICATION_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionAttempts: 5,
            timeout: 5000
        });

        socket.on('connect', () => {
            console.log('[Socket] Connected:', socket.id);
            updateConnectionStatus(true);

            const user = auth.getUser();
            if (user) {
                socket.emit('register', {
                    userId: user.id,
                    customerId: user.customerId,
                    role: user.role
                });
            }
        });

        socket.on('registered', (data) => {
            console.log('[Socket] Registered:', data);
        });

        socket.on('notification', (data) => {
            showToast(data.message || 'New notification', 'info', data.status);
            document.dispatchEvent(new CustomEvent('swifttrack:notification', { detail: data }));
        });

        socket.on('order:update', (data) => {
            showToast(
                data.message || `Order ${data.orderId} updated`,
                data.severity === 'error' ? 'error' : 'success',
                data.status
            );
            document.dispatchEvent(new CustomEvent('swifttrack:order-update', { detail: data }));
        });

        socket.on('driver:notification', (data) => {
            showToast(data.message || 'Route update received', 'warning');
            document.dispatchEvent(new CustomEvent('swifttrack:driver-update', { detail: data }));
        });

        socket.on('disconnect', () => {
            updateConnectionStatus(false);
        });

        socket.on('connect_error', () => {
            updateConnectionStatus(false);
        });
    } catch (err) {
        console.warn('[Socket] Failed to connect:', err.message);
        updateConnectionStatus(false);
    }

    return socket;
}

export function subscribeToOrder(orderId) {
    if (socket?.connected) {
        socket.emit('subscribe:order', orderId);
    }
}

export function unsubscribeFromOrder(orderId) {
    if (socket?.connected) {
        socket.emit('unsubscribe:order', orderId);
    }
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        const dot = statusEl.querySelector('.connection-dot');
        const text = statusEl.querySelector('.connection-text');
        if (dot) dot.className = `connection-dot ${connected ? 'connected' : ''}`;
        if (text) text.textContent = connected ? 'Live' : 'Mock';
    }
}
