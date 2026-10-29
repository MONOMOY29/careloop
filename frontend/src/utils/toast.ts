/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

let toasts: ToastMessage[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function showToast(toast: Omit<ToastMessage, 'id'>) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newToast: ToastMessage = { ...toast, id };
  toasts = [newToast, ...toasts];
  notify();

  const duration = toast.duration ?? 4500;
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function subscribeToasts(listener: ToastListener) {
  listeners.add(listener);
  listener([...toasts]);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Formats API errors (404 detail string, 422 detail array) into clean toast messages
 */
export function showApiErrorToast(err: any, fallbackTitle = 'Action Failed') {
  if (err?.detail) {
    if (Array.isArray(err.detail)) {
      const messages = err.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      showToast({
        type: 'error',
        title: `Validation Error (${err.status || 422})`,
        message: messages,
      });
      return;
    }
    showToast({
      type: 'error',
      title: `Error (${err.status || 400})`,
      message: String(err.detail),
    });
    return;
  }

  showToast({
    type: 'error',
    title: fallbackTitle,
    message: err?.message || 'An unexpected error occurred.',
  });
}
