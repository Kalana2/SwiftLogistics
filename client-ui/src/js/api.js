// API client — tries real backend first, falls back to mock API if unavailable

import {
    mockLogin, mockGetOrders, mockGetOrder, mockCreateOrder,
    mockGetManifest, mockUpdateDeliveryStatus
} from './mock-api.js';

const BASE_URL = 'http://localhost:3000';
let useMock = false; // auto-detected

function getToken() {
    return localStorage.getItem('swifttrack_token');
}

function setToken(token) {
    localStorage.setItem('swifttrack_token', token);
}

function removeToken() {
    localStorage.removeItem('swifttrack_token');
}

function getUser() {
    const raw = localStorage.getItem('swifttrack_user');
    return raw ? JSON.parse(raw) : null;
}

function setUser(user) {
    localStorage.setItem('swifttrack_user', JSON.stringify(user));
}

function removeUser() {
    localStorage.removeItem('swifttrack_user');
}

async function request(method, path, body = null) {
    // If we already know the backend is down, skip the fetch
    if (useMock) {
        return handleMock(method, path, body);
    }

    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(`${BASE_URL}${path}`, opts);

        if (res.status === 401) {
            removeToken();
            removeUser();
            window.location.hash = '#/login';
            throw new Error('Session expired');
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
        return data;

    } catch (err) {
        // Network error → backend is offline, switch to mock mode
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            console.warn('[API] Backend unavailable, switching to mock mode');
            useMock = true;
            return handleMock(method, path, body);
        }
        throw err;
    }
}

function handleMock(method, path, body) {
    // Route to mock handlers
    if (path === '/api/auth/login' && method === 'POST') {
        const result = mockLogin(body.username, body.password);
        if (!result.ok) throw new Error(result.data.error);
        return result.data;
    }
    if (path === '/api/orders' && method === 'GET') {
        return mockGetOrders().data;
    }
    if (path.match(/^\/api\/orders\//) && method === 'GET') {
        const id = path.split('/').pop();
        const result = mockGetOrder(id);
        if (!result.ok) throw new Error(result.data.error);
        return result.data;
    }
    if (path === '/api/orders' && method === 'POST') {
        return mockCreateOrder(body).data;
    }
    if (path === '/api/driver/manifest' && method === 'GET') {
        return mockGetManifest().data;
    }
    if (path.match(/\/api\/driver\/delivery\/.+\/status/) && method === 'POST') {
        const orderId = path.split('/')[4];
        return mockUpdateDeliveryStatus(orderId, body.status, body.notes).data;
    }

    throw new Error('Unknown mock route: ' + path);
}

// Public API
export const api = {
    login: (username, password) =>
        request('POST', '/api/auth/login', { username, password }),

    register: (username, password, role) =>
        request('POST', '/api/auth/register', { username, password, role }),

    getOrders: () =>
        request('GET', '/api/orders'),

    getOrder: (orderId) =>
        request('GET', `/api/orders/${orderId}`),

    createOrder: (orderData) =>
        request('POST', '/api/orders', orderData),

    getManifest: () =>
        request('GET', '/api/driver/manifest'),

    updateDeliveryStatus: (orderId, status, notes = '') =>
        request('POST', `/api/driver/delivery/${orderId}/status`, { status, notes }),
};

export const auth = {
    getToken,
    setToken,
    removeToken,
    getUser,
    setUser,
    removeUser,
    isAuthenticated: () => !!getToken(),
    logout: () => {
        removeToken();
        removeUser();
        window.location.hash = '#/login';
    }
};
