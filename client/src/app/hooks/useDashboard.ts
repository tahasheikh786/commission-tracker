import { useState, useEffect, useCallback } from 'react';

interface DashboardStats {
  total_statements: number;
  total_carriers: number;
  total_premium: number | null;
  policies_count: number | null;
  pending_reviews: number;
  approved_statements: number;
  rejected_statements: number;
}

interface Carrier {
  id: string;
  name: string;
  statement_count: number;
}

interface Statement {
  id: string;
  file_name: string;
  company_name: string;
  status: 'extracted' | 'success' | 'completed' | 'Approved' | 'rejected';
  uploaded_at: string;
  last_updated: string;
  completed_at?: string;
  rejection_reason?: string;
  plan_types?: string[];
  raw_data?: any;
  edited_tables?: any;
  final_data?: any;
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard/stats');
      if (!response.ok) throw new Error('Failed to fetch dashboard stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

export function useCarriers() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCarriers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dashboard/carriers');
      if (!response.ok) throw new Error('Failed to fetch carriers');
      const data = await response.json();
      setCarriers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching carriers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { carriers, loading, error, fetchCarriers };
}

export function useStatements() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatements = useCallback(async (status?: 'pending' | 'approved' | 'rejected') => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = status 
        ? `/api/dashboard/statements/${status}`
        : '/api/dashboard/statements';
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch statements');
      const data = await response.json();
      setStatements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching statements:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { statements, loading, error, fetchStatements };
} 