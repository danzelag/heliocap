'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'
import { SolarUtils } from '@/lib/solar-utils'

interface InteractiveROIProps {
  initialSavings: number
  initialPayback: number
  buildingType: string
}

export function InteractiveROI({ initialSavings, initialPayback, buildingType }: InteractiveROIProps) {
  const defaultRate = SolarUtils.getRateByBuildingType(buildingType)
  const [rate, setRate] = useState(defaultRate)

  // Reverse engineer baseline to support overrides seamlessly
  const { annualProductionKWh, netCost } = useMemo(() => {
    return {
      annualProductionKWh: initialSavings / defaultRate,
      netCost: initialPayback * initialSavings
    }
  }, [initialSavings, initialPayback, defaultRate])

  // Calculate dynamic values
  const currentSavings = annualProductionKWh * rate
  const currentPayback = netCost / currentSavings

  return (
    <div className="md:col-span-2 space-y-6">
      <div className="bg-white border border-[#E2E8F0] p-6 rounded-sm shadow-sm">
        <label className="text-sm font-bold text-[#0F172A] flex justify-between items-center mb-4">
          <span>Projected Utility Rate (cents/kWh)</span>
          <span className="text-[#10B981] text-lg font-bold">{(rate * 100).toFixed(1)}¢</span>
        </label>
        <input
          type="range"
          min="0.08"
          max="0.30"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value))}
          className="w-full h-2 bg-[#E2E8F0] rounded-lg appearance-none cursor-pointer accent-[#10B981]"
        />
        <div className="flex justify-between text-[10px] text-[#64748B] font-bold tracking-widest uppercase mt-2">
          <span>8¢</span>
          <span>Baseline: {(defaultRate * 100).toFixed(1)}¢</span>
          <span>30¢</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-sm transition-all duration-300">
          <CardContent className="p-8 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Payback Period</p>
            <p className="text-5xl font-bold text-[#0F172A]">
              {currentPayback.toFixed(1)} <span className="text-xl font-medium text-[#64748B]">Years</span>
            </p>
            <p className="text-xs text-[#10B981] font-bold flex items-center gap-1">
              <ChevronRight className="w-3 h-3" /> Top 5% ROI for {buildingType}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-[#0F172A] border-none shadow-sm rounded-sm transition-all duration-300">
          <CardContent className="p-8 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">25-Year Net Savings</p>
            <p className="text-5xl font-bold text-[#10B981]">
              ${(Math.round(currentSavings) * 25).toLocaleString()}
            </p>
            <p className="text-xs text-white/60 font-medium">Projected cumulative utility offset.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
