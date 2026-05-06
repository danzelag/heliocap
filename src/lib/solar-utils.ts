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
    const boundedRoofSqft = Math.min(Math.max(roofSqft || 0, 0), 180000);
    const usableRoofSqft = boundedRoofSqft * 0.42;
    const panelCount = Math.min(Math.floor(usableRoofSqft / 37), 3600);
    const systemSizeKW = panelCount * 0.4;

    // GTA commercial rooftops usually land near 1,100-1,250 kWh/kW after real-world losses.
    const annualProductionKWh = systemSizeKW * 1180;
    
    const annualSavings = Math.min(annualProductionKWh * rate, 375000);
    
    const grossCost = systemSizeKW * 1000 * 1.8;
    const itcDiscount = grossCost * 0.30;
    const netCost = grossCost - itcDiscount;
    const paybackYears = annualSavings > 0 ? netCost / annualSavings : 0;

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
