export interface CommissionData {
  id: string;
  carrier_id?: string;
  carrier_name?: string;
  carrier_ids?: string[];
  carrier_names?: string[];
  carrier_count?: number;
  client_name: string;
  invoice_total: number;
  commission_earned: number;
  statement_count: number;
  upload_ids?: string[];
  approved_statement_count?: number;
  statement_date?: string;
  statement_month?: number;
  statement_year?: number;
  monthly_breakdown?: {
    jan: number; feb: number; mar: number; apr: number;
    may: number; jun: number; jul: number; aug: number;
    sep: number; oct: number; nov: number; dec: number;
  };
  last_updated?: string;
  created_at?: string;
}

export interface CarrierGroup {
  carrierId: string;
  carrierName: string;
  companies: CommissionData[];
  totalCommission: number;
  totalInvoice: number;
  companyCount: number;
  statementCount: number;
}

