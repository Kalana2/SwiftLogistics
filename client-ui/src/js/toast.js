// Toast notification system
import { icon, renderIcons } from './icons.js';

const TOAST_DURATION = 5000;

const iconMap = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
};

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {'success'|'error'|'warning'|'info'} type - Toast type
 * @param {string} title - Optional title
 */
export function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
    <span class="toast-icon">${icon(iconMap[type] || 'info', 18)}</span>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-dismiss" aria-label="Dismiss">${icon('x', 14)}</button>
  `;

    container.appendChild(toast);
    renderIcons();

    // Dismiss on click
    toast.querySelector('.toast-dismiss').addEventListener('click', () => {
        dismissToast(toast);
    });

    // Auto dismiss
    setTimeout(() => dismissToast(toast), TOAST_DURATION);
}

function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => {
        toast.remove();
    });
}
