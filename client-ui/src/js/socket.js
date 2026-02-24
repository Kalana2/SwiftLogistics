// Socket.io wrapper for real-time notifications
// socket.io-client loaded globally from CDN

import { auth } from './api.js';
import { showToast } from './toast.js';

let socket = null;
let statusEl = null;

export function initSocket() {
    if (socket) return socket;

    const NOTIFICATION_URL = 'http://localhost:3005';

    socket = window.io(NOTIFICATION_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        console.log('[Socket] Connected:', socket.id);
        updateConnectionStatus(true);

        // Register with user info
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
        console.log('[Socket] Notification:', data);
        showToast(data.message || 'New notification', 'info', data.status);
        document.dispatchEvent(new CustomEvent('swifttrack:notification', { detail: data }));
    });

    socket.on('order:update', (data) => {
        console.log('[Socket] Order update:', data);
        showToast(
            data.message || `Order ${data.orderId} updated`,
            data.severity === 'error' ? 'error' : 'success',
            data.status
        );
        document.dispatchEvent(new CustomEvent('swifttrack:order-update', { detail: data }));
    });

    socket.on('driver:notification', (data) => {
        console.log('[Socket] Driver notification:', data);
        showToast(data.message || 'Route update received', 'warning');
        document.dispatchEvent(new CustomEvent('swifttrack:driver-update', { detail: data }));
    });

    socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        updateConnectionStatus(false);
    });

    socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
        updateConnectionStatus(false);
    });

    return socket;
}

export function subscribeToOrder(orderId) {
    if (socket) {
        socket.emit('subscribe:order', orderId);
    }
}

export function unsubscribeFromOrder(orderId) {
    if (socket) {
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
    statusEl = document.getElementById('connection-status');
    if (statusEl) {
        const dot = statusEl.querySelector('.connection-dot');
        const text = statusEl.querySelector('.connection-text');
        if (dot) dot.className = `connection-dot ${connected ? 'connected' : ''}`;
        if (text) text.textContent = connected ? 'Live' : 'Offline';
    }
}
