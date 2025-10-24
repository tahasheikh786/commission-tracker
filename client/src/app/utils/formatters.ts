/**
 * Formatting utilities for the commission tracker application
 */

/**
 * Format a number as USD currency
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Format currency in compact form (e.g., $1.4M, $306k)
 */
export const formatCurrencyCompact = (value: number): string => {
  const absValue = Math.abs(value);
  
  if (absValue >= 1000000) {
    // Format as millions (e.g., $1.4M)
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    // Format as thousands (e.g., $306k)
    return `$${Math.round(value / 1000)}k`;
  } else {
    // Format normally for values under 1000
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
};

/**
 * Format monthly value - show dash for 0, currency for non-zero values
 */
export const formatMonthlyValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null || value === 0) {
    return '-';
  }
  return formatCurrency(value);
};

/**
 * Format date string to localized format
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Calculate pagination bounds
 */
export const getPaginationBounds = (
  currentPage: number,
  itemsPerPage: number,
  totalItems: number
) => {
  const start = Math.min((currentPage - 1) * itemsPerPage + 1, totalItems);
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  return { start, end };
};

