/**
 * Utility functions for solar calculations and slug generation.
 * These are safe to use in both Client and Server components.
 */

export class SolarUtils {
  /**
   * AI-Powered Estimation Logic (V1)
   * Calculates potential solar savings and ROI based on roof area.
   */
  static calculateEstimation(roofSqft: number, rate: number = 0.12) {
    // 1. System Size (kW): Avg 1 panel (400W) per 25 sqft
    const systemSizeKW = (roofSqft / 25) * 0.4;
    
    // 2. Annual Production (kWh): Avg 1450 sun-hours per year
    const annualProductionKWh = systemSizeKW * 1450;
    
    // 3. Annual Savings ($): Production * Utility Rate
    const annualSavings = annualProductionKWh * rate;
    
    // 4. Payback Period (Years): Estimated $2.50/watt install cost
    // We apply the 30% Investment Tax Credit (ITC) as it's standard for commercial solar
    const grossCost = systemSizeKW * 1000 * 2.5;
    const itcDiscount = grossCost * 0.30;
    const netCost = grossCost - itcDiscount;
    const paybackYears = netCost / annualSavings;

    return {
      savings: Math.round(annualSavings),
      payback: parseFloat(paybackYears.toFixed(1))
    };
  }

  /**
   * Utility to auto-generate a URL-friendly slug.
   */
  static generateSlug(businessName: string): string {
    return businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  /**
   * Returns a suggested utility rate based on building type.
   */
  static getRateByBuildingType(type: string): number {
    const rates: Record<string, number> = {
      warehouse: 0.12,
      factory: 0.16,
      office: 0.14,
      cold_storage: 0.22,
      retail: 0.14
    };
    return rates[type] || 0.12;
  }
  
  /**
   * Returns a proxy roof size (sqft) based on building type if none provided.
   */
  static getProxySqftByBuildingType(type: string): number {
    const sizes: Record<string, number> = {
      warehouse: 40000,
      factory: 60000,
      office: 25000,
      cold_storage: 40000,
      retail: 30000
    };
    return sizes[type] || 30000;
  }
}
