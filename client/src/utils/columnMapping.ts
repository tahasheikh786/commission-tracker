// src/lib/columnMapping.ts

export const FIELD_MAP: Record<string, string[]> = {
    companyName: ['company', 'employer', 'group name', 'insured name', 'client', "billing group"],
    planType: ['plan', 'plan type', 'description'],
    carrier: ['carrier', 'insurer', 'provider'],
    enrollmentCount: [
      'current month subscribers', 'census ct.', 'total subscribers',
      'enrollment', 'enrolled', 'subscriber count', 'current subscribers'
    ],
    ratePEPM: [
      'rate', 'agent rate', 'employee rate', 'remarks', 'split olo', 'comm olo', 'comm 010', 'commission rate'
    ],
    billingPeriod: [
      'billing period', 'period', 'adj. period', 'invoice period', 'month'
    ],
    premiumAmount: [
      'premium', 'premium amount', 'invoice total', 'annualized target premium',
      'annualized commission', 'invoice amount', 'paid amount', 'net advance', 'commission due'
    ],
    groupID: ['group id', 'case no.', 'policy number', 'group no.'],
    // Add more as you discover new variations
  };
  
  /** Find column index by field in table header (case-insensitive, fuzzy contains) */
  export function findColumnIndex(header: string[], field: string): number | null {
    const candidates = FIELD_MAP[field].map(h => h.toLowerCase());
    for (let i = 0; i < header.length; i++) {
      const colHeader = header[i].toLowerCase();
      if (candidates.some(c => colHeader.includes(c))) return i;
    }
    return null;
  }
  