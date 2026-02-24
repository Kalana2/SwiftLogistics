// API client — wraps fetch with JWT auth, base URL config, error handling

const BASE_URL = 'http://localhost:3000';

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
    const headers = { 'Content-Type': 'application/json' };

    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const opts = { method, headers };
    if (body) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${path}`, opts);

    if (res.status === 401) {
        removeToken();
        removeUser();
        window.location.hash = '#/login';
        throw new Error('Session expired');
    }

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }

    return data;
}

// Public API
export const api = {
    // Auth
    login: (username, password) =>
        request('POST', '/api/auth/login', { username, password }),

    register: (username, password, role) =>
        request('POST', '/api/auth/register', { username, password, role }),

    // Orders
    getOrders: () =>
        request('GET', '/api/orders'),

    getOrder: (orderId) =>
        request('GET', `/api/orders/${orderId}`),

    createOrder: (orderData) =>
        request('POST', '/api/orders', orderData),

    // Driver
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
