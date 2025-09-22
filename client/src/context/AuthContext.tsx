'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
// Using browser's built-in cookie handling instead of js-cookie
import axios from 'axios';

// Cookie utility functions
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
};

const setCookie = (name: string, value: string, days: number) => {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
  const isSecure = window.location.protocol === 'https:';
  // Use lax samesite for development to avoid issues
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;${isSecure ? 'secure;' : ''}samesite=lax`;
};

const deleteCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
};

// Types
interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  company_id?: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

interface LoginRequest {
  email: string;
  password?: string;
}

interface SignupRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
  expires_in: number;
}

interface UserPermissions {
  can_upload: boolean;
  can_edit: boolean;
  is_admin: boolean;
  is_read_only: boolean;
}

interface AuthContextType {
  user: User | null;
  permissions: UserPermissions | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  signup: (credentials: SignupRequest) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  checkPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Configure axios defaults
axios.defaults.baseURL = API_BASE_URL;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  const logout = () => {
    // Clear token from cookie
    deleteCookie('access_token');
    
    // Remove axios default header
    delete axios.defaults.headers.common['Authorization'];

    // Clear state
    setUser(null);
    setPermissions(null);

    // Redirect to login
    router.push('/auth/login');
  };

  // Set up axios interceptor for auth token
  useEffect(() => {
    const token = getCookie('access_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Response interceptor to handle token expiration
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [logout]);

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getCookie('access_token');
      console.log('Auth check - token found:', !!token);
      if (token) {
        try {
          console.log('Attempting to refresh user...');
          await refreshUser();
          console.log('User refreshed successfully');
        } catch (error) {
          console.error('Auth check failed:', error);
          logout();
        }
      } else {
        console.log('No token found, user not authenticated');
      }
      setIsLoading(false);
    };

    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log('Auth check timeout, setting loading to false');
      setIsLoading(false);
    }, 5000); // 5 second timeout

    checkAuth().finally(() => {
      clearTimeout(timeoutId);
    });
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      console.log('Attempting login...');
      const response = await axios.post<LoginResponse>('/auth/login', credentials);
      const { access_token, user: userData } = response.data;

      console.log('Login successful, storing token...');
      // Store token in cookie
      setCookie('access_token', access_token, 1); // 1 day

      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      setUser(userData);
      await checkPermissions();
      console.log('Login completed successfully');
    } catch (error: any) {
      console.error('Login failed:', error);
      const errorMessage = error.response?.data?.detail || 'Login failed';
      throw new Error(errorMessage);
    }
  };

  const signup = async (credentials: SignupRequest) => {
    try {
      const response = await axios.post<LoginResponse>('/auth/signup', credentials);
      const { access_token, user: userData } = response.data;

      // Store token in cookie
      setCookie('access_token', access_token, 1); // 1 day

      // Set axios default header
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      setUser(userData);
      await checkPermissions();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Signup failed';
      throw new Error(errorMessage);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await axios.get<User>('/auth/me');
      console.log('refreshUser: User data received:', response.data);
      setUser(response.data);
      await checkPermissions();
    } catch (error) {
      console.error('refreshUser: Error:', error);
      throw error;
    }
  };

  const checkPermissions = async () => {
    try {
      const response = await axios.get<UserPermissions>('/auth/permissions');
      setPermissions(response.data);
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    }
  };

  const value: AuthContextType = {
    user,
    permissions,
    isLoading,
    isAuthenticated,
    login,
    signup,
    logout,
    refreshUser,
    checkPermissions,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
