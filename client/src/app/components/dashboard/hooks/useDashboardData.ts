import React from 'react';
import { 
  useEarnedCommissionStats, 
  useDashboardStats, 
  useAvailableYears, 
  useAllCommissionData,
  useCarriersWithCommission,
  useCarrierPieChartData
} from '../../../hooks/useDashboard';
import { extractMonthlyData } from '../../../utils/analyticsUtils';

interface DashboardDataProps {
  environmentId: string | null;
  year: number;
  dateRange: { start: Date; end: Date };
}

export function useDashboardData({ environmentId, year, dateRange }: DashboardDataProps) {
  // Use existing hooks from the application
  const { stats: commissionStats, loading: isLoadingStats } = useEarnedCommissionStats(year, true, environmentId);
  const { stats: dashboardData, loading: isLoadingDashboard } = useDashboardStats(true, environmentId);
  const { data: allCommissionData, loading: isLoadingAllCommission } = useAllCommissionData(year, environmentId);
  const { carriers: carrierData, loading: isLoadingCarriers } = useCarriersWithCommission();
  const { data: pieChartData, loading: isLoadingPieChart } = useCarrierPieChartData(year, environmentId);
  
  // Fetch aggregated companies data
  const [companiesData, setCompaniesData] = React.useState<any[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = React.useState(true);

  React.useEffect(() => {
    const fetchCompanies = async () => {
      setIsLoadingCompanies(true);
      try {
        const params = new URLSearchParams();
        params.append('view_mode', 'my_data');
        if (year) params.append('year', year.toString());
        if (environmentId) params.append('environment_id', environmentId);
        
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/earned-commission/companies-aggregated?${params.toString()}`,
          { credentials: 'include' }
        );
        
        if (response.ok) {
          const data = await response.json();
          setCompaniesData(Array.isArray(data) ? data : []);
        } else {
          setCompaniesData([]);
        }
      } catch (error) {
        console.error('Error fetching companies data:', error);
        setCompaniesData([]);
      } finally {
        setIsLoadingCompanies(false);
      }
    };

    fetchCompanies();
  }, [year, environmentId]);

  // Transform data for dashboard format
  const transformedData = {
    metrics: {
      totalCommission: {
        value: commissionStats?.total_commission ? commissionStats.total_commission / 1000 : 0,
        change: commissionStats?.year_over_year_growth || 0,
        trend: (commissionStats?.year_over_year_growth || 0) > 0 ? 'up' as const : 'neutral' as const,
        sparkline: allCommissionData?.map((d: any) => (d.total_commission || 0) / 1000).slice(0, 7) || []
      },
      activeCarriers: {
        value: dashboardData?.total_carriers || carrierData?.length || 0,
        change: 0,
        trend: 'neutral' as const
      },
      statementsProcessed: {
        value: dashboardData?.total_statements || 0,
        change: 0,
        trend: 'neutral' as const
      },
      successRate: {
        value: dashboardData?.approved_statements && dashboardData?.total_statements 
          ? Math.round((dashboardData.approved_statements / dashboardData.total_statements) * 100)
          : 0,
        change: 0,
        trend: 'neutral' as const
      },
      avgCommissionRate: {
        value: commissionStats?.average_commission_rate || 0,
        change: 0,
        trend: 'neutral' as const
      }
    },
    trends: allCommissionData && allCommissionData.length > 0 ? (() => {
      // Use the same data processing logic as the analytics tab
      const monthlyData = extractMonthlyData(allCommissionData);
      const commissionValues = monthlyData.map(d => d.commission);
      
      // Only return trends data if there's actual commission data
      if (!commissionValues.some(val => val > 0)) {
        return undefined;
      }
      
      // Count months with actual data (non-zero values)
      const monthsWithData = commissionValues.filter(val => val > 0).length;
      
      return {
        labels: monthlyData.map(d => d.month),
        commission: commissionValues,
        growth: commissionValues.map((curr, i) => {
          if (i === 0) return 0;
          const prev = commissionValues[i - 1];
          
          // FIXED: Better handling of sparse data
          // If previous month was 0, we can't calculate meaningful growth
          if (prev === 0) return 0;
          
          // Calculate growth rate
          const growthRate = ((curr - prev) / prev) * 100;
          
          // FIXED: Normalize to 1 decimal place and cap extreme values
          // With only 2 statements, month-to-month can be extreme
          // Cap at ±100% to avoid misleading percentages like -80.287671142515885%
          if (monthsWithData < 3) {
            // Not enough data for meaningful trends, return 0
            return 0;
          }
          
          // Cap extreme values and normalize
          const cappedGrowth = Math.max(-100, Math.min(100, growthRate));
          return parseFloat(cappedGrowth.toFixed(1));
        })
      };
    })() : undefined,
    carriers: carrierData && carrierData.length > 0 ? {
      carriers: carrierData.map((c: any) => c.name),
      amounts: carrierData.map((c: any) => c.total_commission || 0),
      percentages: (() => {
        const total = carrierData.reduce((sum: number, carrier: any) => sum + (carrier.total_commission || 0), 0);
        return carrierData.map((c: any) => {
          return total > 0 ? parseFloat((((c.total_commission || 0) / total) * 100).toFixed(1)) : 0;
        });
      })(),
      growth: carrierData.map((c: any) => {
        // FIXED: Only show growth if we have actual historical data
        // Otherwise, don't show any growth indicator (return 0)
        if (c.growth !== undefined && c.growth !== null) {
          return parseFloat(c.growth.toFixed(1));
        }
        // If no historical data available, return null to indicate no growth data
        return 0;
      }),
      statements: carrierData.map((c: any) => c.statement_count || 0)
    } : undefined,
    distribution: pieChartData && pieChartData.length > 0 ? {
      labels: pieChartData.map((d: any) => d.carrier_name),
      values: pieChartData.map((d: any) => d.total_commission || d.value || 0),
      colors: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(147, 51, 234, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(163, 163, 163, 0.8)'
      ]
    } : undefined,
    recentActivity: [], // TODO: Implement actual recent activity from backend
    insights: (() => {
      const insights = [];
      
      // Only show growth insight if there's actual growth data
      if (commissionStats?.year_over_year_growth && commissionStats.year_over_year_growth !== 0) {
        insights.push({
          id: '1',
          type: 'growth' as const,
          title: `Your commission ${commissionStats.year_over_year_growth > 0 ? 'grew' : 'decreased'} ${Math.abs(commissionStats.year_over_year_growth)}% this year`,
          description: commissionStats.year_over_year_growth > 0 ? 'Keep up the great work!' : 'Let\'s improve next year',
          dismissible: true
        });
      }
      
      // Only show top performer if we have carriers with commission
      if (carrierData && carrierData.length > 0 && carrierData[0]?.total_commission > 0) {
        const totalCommission = carrierData.reduce((sum: number, c: any) => sum + (c.total_commission || 0), 0);
        if (totalCommission > 0) {
          insights.push({
            id: '2',
            type: 'achievement' as const,
            title: `Top performer: ${carrierData[0].name}`,
            description: `Contributing ${Math.round((carrierData[0].total_commission / totalCommission) * 100)}% of total commission`,
            action: {
              label: 'View Details',
              onClick: () => console.log('View carrier details')
            }
          });
        }
      }
      
      return insights;
    })(),
    topCompanies: companiesData && companiesData.length > 0 
      ? companiesData.map((company: any) => ({
          name: company.client_name || 'Unknown',
          commission: company.commission_earned || 0,
          growth: 0, // Growth data would need historical comparison
          statements: company.statement_count || 0,
          lastUpdated: company.last_updated || new Date().toISOString()
        }))
      : []
  };

  const isLoading = isLoadingStats || isLoadingDashboard || isLoadingAllCommission || isLoadingCarriers || isLoadingPieChart || isLoadingCompanies;

  return {
    data: transformedData,
    isLoading,
    error: null,
    refetch: () => {
      // Refetch all data
      console.log('Refetching dashboard data...');
    }
  };
}
