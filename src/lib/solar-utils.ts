/**
 * Utility functions for solar calculations and slug generation.
 * These are safe to use in both Client and Server components.
 */

export class SolarUtils {
  /**
   * AI-Powered Estimation Logic (V1)
   * Calculates potential solar savings and ROI based on roof area.
   */
  static calculateEstimation(roofSqft: number, rate: number = 0.18) {
    // 1. System Size (kW): Avg 1 panel (400W) per 25 sqft
    const systemSizeKW = (roofSqft / 25) * 0.4;

    // 2. Annual Production (kWh): GTA ~1,300 peak sun-hours/year
    const annualProductionKWh = systemSizeKW * 1300;
    
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
    // Ontario all-in rates (electricity + Global Adjustment + delivery ~$0.18–0.22/kWh)
    const rates: Record<string, number> = {
      warehouse: 0.18,
      factory: 0.20,
      office: 0.18,
      cold_storage: 0.24,
      retail: 0.19
    };
    return rates[type] || 0.18;
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
