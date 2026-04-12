const API_BASE = '/api';

/**
 * Get the stored access token.
 */
export function getToken() {
  return localStorage.getItem('accessToken');
}

/**
 * Store the access token.
 */
export function setToken(token) {
  localStorage.setItem('accessToken', token);
}

/**
 * Remove the access token.
 */
export function clearToken() {
  localStorage.removeItem('accessToken');
}

/**
 * Make an authenticated API request.
 * Automatically handles token refresh on 401.
 */
export async function api(endpoint, options = {}) {
  const token = getToken();

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  let response = await fetch(`${API_BASE}${endpoint}`, config);

  // If token expired, try to refresh
  if (response.status === 401) {
    const data = await response.json();
    if (data.code === 'TOKEN_EXPIRED') {
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry the original request with new token
        config.headers.Authorization = `Bearer ${getToken()}`;
        response = await fetch(`${API_BASE}${endpoint}`, config);
      }
    }
  }

  return response;
}

/**
 * Attempt to refresh the access token using the refresh cookie.
 */
export async function refreshToken() {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      setToken(data.accessToken);
      return true;
    }
  } catch {
    // Refresh failed
  }

  clearToken();
  return false;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes) {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format duration (seconds) into MM:SS or HH:MM:SS.
 */
export function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format price from paise to INR display.
 */
export function formatPrice(paise) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}
