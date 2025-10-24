import { CompanyNameNormalizer } from './CompanyNameNormalizer';

export interface CarrierDetail {
  carrier_name: string;
  commission_earned: number;
  invoice_total: number;
  statement_count: number;
  statement_year?: number;
}

export interface CommissionDataItem {
  id: string;
  client_name: string;
  carrier_name?: string;
  commission_earned: number;
  invoice_total: number;
  statement_count: number;
  statement_year?: number;
}

export interface AggregatedCompany {
  id: string;
  client_name: string;
  commission_earned: number;
  invoice_total: number;
  statement_count: number;
  carrierDetails: CarrierDetail[];
  carrierCount: number;
  carrier_name: string;
}

/**
 * Normalize and aggregate companies with carrier tracking
 * Groups companies by core name and merges similar variations
 */
export function aggregateCompanies(data: CommissionDataItem[]): AggregatedCompany[] {
  // Step 1: Group by exact core name
  const companiesMap = new Map<string, {
    normalizedName: string;
    originalNames: Set<string>;
    commission_earned: number;
    invoice_total: number;
    statement_count: number;
    carrierDetails: CarrierDetail[];
    id: string;
    coreName: string;
  }>();
  
  data.forEach(item => {
    // Use core name (without suffix) as the grouping key
    const coreName = CompanyNameNormalizer.getCoreName(item.client_name).trim();
    const normalizedName = CompanyNameNormalizer.normalize(item.client_name);
    const carrierName = item.carrier_name || 'Unknown Carrier';
    
    if (!companiesMap.has(coreName)) {
      companiesMap.set(coreName, {
        normalizedName,
        originalNames: new Set([item.client_name]),
        commission_earned: item.commission_earned,
        invoice_total: item.invoice_total,
        statement_count: item.statement_count,
        carrierDetails: [{
          carrier_name: carrierName,
          commission_earned: item.commission_earned,
          invoice_total: item.invoice_total,
          statement_count: item.statement_count,
          statement_year: item.statement_year
        }],
        id: item.id,
        coreName
      });
    } else {
      const existing = companiesMap.get(coreName)!;
      existing.originalNames.add(item.client_name);
      existing.commission_earned += item.commission_earned;
      existing.invoice_total += item.invoice_total;
      existing.statement_count += item.statement_count;
      
      // Update to the longest/most complete normalized name
      if (normalizedName.length > existing.normalizedName.length) {
        existing.normalizedName = normalizedName;
      }
      
      // Check if carrier already exists for this company
      const existingCarrierIndex = existing.carrierDetails.findIndex(
        c => c.carrier_name === carrierName
      );
      
      if (existingCarrierIndex >= 0) {
        // Aggregate existing carrier
        existing.carrierDetails[existingCarrierIndex].commission_earned += item.commission_earned;
        existing.carrierDetails[existingCarrierIndex].invoice_total += item.invoice_total;
        existing.carrierDetails[existingCarrierIndex].statement_count += item.statement_count;
      } else {
        // Add new carrier
        existing.carrierDetails.push({
          carrier_name: carrierName,
          commission_earned: item.commission_earned,
          invoice_total: item.invoice_total,
          statement_count: item.statement_count,
          statement_year: item.statement_year
        });
      }
    }
  });
  
  // Step 2: OPTIMIZED similarity merging - only compare companies with same prefix
  const companiesArray = Array.from(companiesMap.values());
  
  // Group by first 3 characters for efficient comparison
  const prefixGroups = new Map<string, typeof companiesArray>();
  companiesArray.forEach(company => {
    const prefix = company.coreName.substring(0, 3).toLowerCase();
    if (!prefixGroups.has(prefix)) {
      prefixGroups.set(prefix, []);
    }
    prefixGroups.get(prefix)!.push(company);
  });
  
  // Merge within each prefix group (much smaller groups!)
  const merged: typeof companiesArray = [];
  prefixGroups.forEach(group => {
    const processed = new Set<number>();
    
    group.forEach((company, i) => {
      if (processed.has(i)) return;
      
      // Start a new merged company
      const mergedCompany = { ...company };
      processed.add(i);
      
      // Only compare within this small prefix group
      group.forEach((otherCompany, j) => {
        if (j <= i || processed.has(j)) return;
        
        const similarity = CompanyNameNormalizer.calculateSimilarity(
          company.coreName,
          otherCompany.coreName
        );
        
        // Merge if highly similar
        if (similarity >= 0.85) {
          mergedCompany.commission_earned += otherCompany.commission_earned;
          mergedCompany.invoice_total += otherCompany.invoice_total;
          mergedCompany.statement_count += otherCompany.statement_count;
          
          // Use the longest name
          if (otherCompany.normalizedName.length > mergedCompany.normalizedName.length) {
            mergedCompany.normalizedName = otherCompany.normalizedName;
          }
          
          // Merge original names
          otherCompany.originalNames.forEach(name => mergedCompany.originalNames.add(name));
          
          // Merge carriers
          otherCompany.carrierDetails.forEach(otherCarrier => {
            const existingCarrierIndex = mergedCompany.carrierDetails.findIndex(
              c => c.carrier_name === otherCarrier.carrier_name
            );
            
            if (existingCarrierIndex >= 0) {
              mergedCompany.carrierDetails[existingCarrierIndex].commission_earned += otherCarrier.commission_earned;
              mergedCompany.carrierDetails[existingCarrierIndex].invoice_total += otherCarrier.invoice_total;
              mergedCompany.carrierDetails[existingCarrierIndex].statement_count += otherCarrier.statement_count;
            } else {
              mergedCompany.carrierDetails.push({ ...otherCarrier });
            }
          });
          
          processed.add(j);
        }
      });
      
      merged.push(mergedCompany);
    });
  });
  
  // Convert to final format and sort
  return merged
    .map(company => ({
      id: company.id,
      client_name: company.normalizedName,
      commission_earned: company.commission_earned,
      invoice_total: company.invoice_total,
      statement_count: company.statement_count,
      carrierDetails: company.carrierDetails,
      carrierCount: company.carrierDetails.length,
      carrier_name: company.carrierDetails.map(c => c.carrier_name).join(', ')
    }))
    .sort((a, b) => a.client_name.localeCompare(b.client_name));
}

