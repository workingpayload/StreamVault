import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, clearToken, getToken, refreshToken } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = getToken();
    if (!token) {
      // Try to refresh
      const refreshed = await refreshToken();
      if (!refreshed) {
        setLoading(false);
        return;
      }
    }

    try {
      const response = await api('/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setSubscription(data.subscription);
        setIsAdmin(data.isAdmin || false);
      } else {
        clearToken();
        setUser(null);
        setSubscription(null);
        setIsAdmin(false);
      }
    } catch {
      clearToken();
      setUser(null);
      setSubscription(null);
      setIsAdmin(false);
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setToken(data.accessToken);
    setUser(data.user);

    // Fetch subscription status
    await checkAuth();

    return data;
  };

  const register = async (name, email, password) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    setToken(data.accessToken);
    setUser(data.user);
    setSubscription(null);

    return data;
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore logout errors
    }
    clearToken();
    setUser(null);
    setSubscription(null);
    setIsAdmin(false);
  };

  const refreshUser = useCallback(async () => {
    await checkAuth();
  }, []);

  const isSubscribed = Boolean(subscription && subscription.status === 'active');

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        loading,
        isSubscribed,
        isAdmin,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
