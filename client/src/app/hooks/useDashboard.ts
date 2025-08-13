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
  status: 'extracted' | 'success' | 'completed' | 'Approved' | 'rejected' | 'pending';
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/stats`);
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard/carriers`);
      if (!response.ok) throw new Error('Failed to fetch carriers');
      const data = await response.json();
      // Sort carriers alphabetically by name
      const sortedCarriers = data.sort((a: Carrier, b: Carrier) => 
        a.name.localeCompare(b.name)
      );
      setCarriers(sortedCarriers);
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
        ? `${process.env.NEXT_PUBLIC_API_URL}/dashboard/statements/${status}`
        : `${process.env.NEXT_PUBLIC_API_URL}/dashboard/statements`;
      
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

// Earned Commission Hooks
export const useEarnedCommissionStats = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError('Failed to fetch earned commission stats');
      }
    } catch (err) {
      setError('Error fetching earned commission stats');
      console.error('Error fetching earned commission stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};

export const useCarrierCommissionStats = (carrierId: string | null) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!carrierId) {
      setStats(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/carrier/${carrierId}/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        setError('Failed to fetch carrier commission stats');
      }
    } catch (err) {
      setError('Error fetching carrier commission stats');
      console.error('Error fetching carrier commission stats:', err);
    } finally {
      setLoading(false);
    }
  }, [carrierId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};

export const useCarriersWithCommission = () => {
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCarriers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/carriers`);
      if (response.ok) {
        const data = await response.json();
        setCarriers(data);
      } else {
        setError('Failed to fetch carriers with commission data');
      }
    } catch (err) {
      setError('Error fetching carriers with commission data');
      console.error('Error fetching carriers with commission data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCarriers();
  }, [fetchCarriers]);

  return { carriers, loading, error, refetch: fetchCarriers };
};

export const useCarrierCommissionData = (carrierId: string | null) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!carrierId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/carrier/${carrierId}/data`);
      if (response.ok) {
        const responseData = await response.json();
        setData(responseData);
      } else {
        setError('Failed to fetch carrier commission data');
      }
    } catch (err) {
      setError('Error fetching carrier commission data');
      console.error('Error fetching carrier commission data:', err);
    } finally {
      setLoading(false);
    }
  }, [carrierId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};

export const useAllCommissionData = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/earned-commission/all-data`);
      if (response.ok) {
        const responseData = await response.json();
        setData(responseData);
      } else {
        setError('Failed to fetch all commission data');
      }
    } catch (err) {
      setError('Error fetching all commission data');
      console.error('Error fetching all commission data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}; 