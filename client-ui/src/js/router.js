// Simple hash-based SPA router with auth guards

import { auth } from './api.js';

const routes = {};
let currentCleanup = null;

/**
 * Register a route
 * @param {string} path - Hash path (e.g. '/login', '/dashboard')
 * @param {Function} handler - Function that renders the page, may return a cleanup function
 * @param {boolean} requiresAuth - Whether route requires authentication
 */
export function route(path, handler, requiresAuth = false) {
    routes[path] = { handler, requiresAuth };
}

/**
 * Navigate to a hash path
 */
export function navigate(path) {
    window.location.hash = `#${path}`;
}

/**
 * Start the router — listens for hash changes
 */
export function startRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';

    // Find matching route
    const routeConfig = routes[hash];

    if (!routeConfig) {
        navigate('/login');
        return;
    }

    // Auth guard
    if (routeConfig.requiresAuth && !auth.isAuthenticated()) {
        navigate('/login');
        return;
    }

    // If logged in and hitting login page, redirect to appropriate dashboard
    if (hash === '/login' && auth.isAuthenticated()) {
        const user = auth.getUser();
        if (user?.role === 'driver') {
            navigate('/driver');
        } else {
            navigate('/dashboard');
        }
        return;
    }

    // Cleanup previous page
    if (typeof currentCleanup === 'function') {
        currentCleanup();
        currentCleanup = null;
    }

    // Render new page
    const cleanup = routeConfig.handler();
    if (typeof cleanup === 'function') {
        currentCleanup = cleanup;
    }
}
