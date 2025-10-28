"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface Environment {
  id: string;
  name: string;
  company_id: string;
  created_by: string;
  created_at: string;
}

interface EnvironmentStats {
  environment_id: string;
  environment_name: string;
  total_uploads: number;
  approved_uploads: number;
  pending_uploads: number;
  total_commissions: number;
  total_commission_earned: number;
  total_invoice_amount: number;
}

interface EnvironmentContextType {
  environments: Environment[];
  activeEnvironment: Environment | null;
  setActiveEnvironment: (env: Environment | null) => void;
  loading: boolean;
  fetchEnvironments: () => Promise<void>;
  createEnvironment: (name: string) => Promise<Environment>;
  deleteEnvironment: (id: string) => Promise<void>;
  resetEnvironment: (id: string) => Promise<{ deleted_counts: { uploads: number; commissions: number; tables: number } }>;
  getEnvironmentStats: (id: string) => Promise<EnvironmentStats>;
}

const EnvironmentContext = createContext<EnvironmentContextType | undefined>(undefined);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvironment, setActiveEnvironmentState] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Fetch environments on mount and when user changes
  useEffect(() => {
    if (user?.id) {
      fetchEnvironments();
    }
  }, [user?.id]);

  // Persist active environment to localStorage
  useEffect(() => {
    if (activeEnvironment) {
      localStorage.setItem('activeEnvironmentId', activeEnvironment.id);
    } else {
      localStorage.removeItem('activeEnvironmentId');
    }
  }, [activeEnvironment]);

  const fetchEnvironments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/environments`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEnvironments(data);
        
        // Restore active environment from localStorage if available
        const savedEnvId = localStorage.getItem('activeEnvironmentId');
        if (savedEnvId) {
          const savedEnv = data.find((env: Environment) => env.id === savedEnvId);
          if (savedEnv) {
            setActiveEnvironmentState(savedEnv);
          } else if (data.length > 0) {
            // If saved environment no longer exists, prioritize "Default" environment
            const defaultEnv = data.find((env: Environment) => env.name === 'Default');
            setActiveEnvironmentState(defaultEnv || data[0]);
          }
        } else if (data.length > 0) {
          // No saved environment, prioritize "Default" environment (auto-select for new users)
          const defaultEnv = data.find((env: Environment) => env.name === 'Default');
          setActiveEnvironmentState(defaultEnv || data[0]);
        }
      } else {
        console.error('Failed to fetch environments:', await response.text());
      }
    } catch (error) {
      console.error('Error fetching environments:', error);
    } finally {
      setLoading(false);
    }
  };

  const createEnvironment = async (name: string): Promise<Environment> => {
    console.log('Creating environment, user data:', { 
      userId: user?.id, 
      companyId: user?.company_id,
      userObject: user 
    });

    if (!user?.id) {
      throw new Error('User not logged in. Please refresh the page and try again.');
    }

    if (!user?.company_id) {
      console.error('User company_id missing:', user);
      throw new Error('Your account is not associated with a company. Please contact support or check your account settings.');
    }

    const response = await fetch(`${API_BASE_URL}/environments`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        company_id: user.company_id,
        created_by: user.id,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create environment');
    }

    const newEnvironment = await response.json();
    await fetchEnvironments(); // Refresh list
    return newEnvironment;
  };

  const deleteEnvironment = async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/environments/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete environment');
    }

    // If deleted environment was active, clear it
    if (activeEnvironment?.id === id) {
      setActiveEnvironmentState(null);
    }

    await fetchEnvironments(); // Refresh list
  };

  const resetEnvironment = async (id: string): Promise<{ deleted_counts: { uploads: number; commissions: number; tables: number } }> => {
    const response = await fetch(`${API_BASE_URL}/environments/${id}/reset`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to reset environment');
    }

    return await response.json();
  };

  const getEnvironmentStats = async (id: string): Promise<EnvironmentStats> => {
    const response = await fetch(`${API_BASE_URL}/environments/${id}/stats`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch environment stats');
    }

    return await response.json();
  };

  const setActiveEnvironment = (env: Environment | null) => {
    setActiveEnvironmentState(env);
  };

  return (
    <EnvironmentContext.Provider
      value={{
        environments,
        activeEnvironment,
        setActiveEnvironment,
        loading,
        fetchEnvironments,
        createEnvironment,
        deleteEnvironment,
        resetEnvironment,
        getEnvironmentStats,
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (context === undefined) {
    throw new Error('useEnvironment must be used within an EnvironmentProvider');
  }
  return context;
}

