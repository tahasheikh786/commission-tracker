'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  otp?: string;
}

interface SignupRequest {
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  company_name?: string;
  otp?: string;
}

interface OTPRequest {
  email: string;
  purpose: 'login' | 'registration';
}

interface OTPVerification {
  email: string;
  otp: string;
  purpose: 'login' | 'registration';
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
  // OTP Methods
  requestOTP: (otpRequest: OTPRequest) => Promise<void>;
  verifyOTP: (otpVerification: OTPVerification) => Promise<LoginResponse>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Configure axios defaults
axios.defaults.baseURL = API_BASE_URL;
axios.defaults.withCredentials = true; // Include cookies in requests

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  const logout = useCallback(async () => {
    try {
      // Call logout endpoint to clear httpOnly cookies
      await axios.post('/auth/otp/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }

    // Clear state
    setUser(null);
    setPermissions(null);

    // Redirect to login
    router.push('/auth/login');
  }, [router]);

  // Set up axios interceptor for auth token
  useEffect(() => {
    // For OTP authentication, we don't need to set Authorization header
    // as tokens are handled via httpOnly cookies

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
      try {
        console.log('Checking auth status...');
        // Use OTP status endpoint to check authentication
        const response = await axios.get('/auth/otp/status');
        if (response.data.is_authenticated) {
          console.log('User is authenticated');
          setUser(response.data.user);
          await checkPermissions();
        } else {
          console.log('User not authenticated');
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setUser(null);
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

  // OTP Methods
  const requestOTP = async (otpRequest: OTPRequest) => {
    try {
      const response = await axios.post('/auth/otp/request', otpRequest);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to send OTP';
      throw new Error(errorMessage);
    }
  };

  const verifyOTP = async (otpVerification: OTPVerification): Promise<LoginResponse> => {
    try {
      const response = await axios.post<LoginResponse>('/auth/otp/verify', otpVerification);
      const { user: userData } = response.data;

      // For OTP authentication, tokens are set as httpOnly cookies by the server
      // We don't need to manually set them here
      
      // Set user data
      setUser(userData);
      await checkPermissions();
      
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'OTP verification failed';
      throw new Error(errorMessage);
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
    requestOTP,
    verifyOTP,
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
