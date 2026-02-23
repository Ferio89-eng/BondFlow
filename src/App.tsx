/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Line,
  ComposedChart
} from 'recharts';
import { 
  TrendingUp, 
  Wallet, 
  Percent, 
  Banknote, 
  Calendar, 
  Info,
  ArrowRightLeft
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CashFlowDetail {
  label: string;
  value: number;
  isFigurative?: boolean;
}

interface CashFlowData {
  time: string;
  positive: number;
  negative: number;
  cumulative: number;
  label: string;
  details: {
    inflows: CashFlowDetail[];
    outflows: CashFlowDetail[];
  };
}

export default function App() {
  // Input states
  const [nominal, setNominal] = useState<number>(10000);
  const [currentPrice, setCurrentPrice] = useState<number>(98.5);
  const [sellingPrice, setSellingPrice] = useState<number>(100);
  const [taxRate, setTaxRate] = useState<number>(12.5); // Default for government bonds in Italy
  const [couponRate, setCouponRate] = useState<number>(3.5);
  const [bankCommission, setBankCommission] = useState<number>(7); // 7 per mille default
  const [periodicity, setPeriodicity] = useState<'annual' | 'semiannual'>('annual');
  const [maturityDate, setMaturityDate] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return d.toISOString().split('T')[0];
  });

  // New parameters
  const [showCumulative, setShowCumulative] = useState<boolean>(false);
  const [includeNominalAtT0, setIncludeNominalAtT0] = useState<boolean>(false); // Default to false as per user request "figurativa"
  const [sellAtMaturity, setSellAtMaturity] = useState<boolean>(true);
  const [showNominal, setShowNominal] = useState<boolean>(false);

  const cashFlows = useMemo(() => {
    const data: CashFlowData[] = [];
    const periodsPerYear = periodicity === 'annual' ? 1 : 2;
    
    // Calculate years from maturity date
    const today = new Date();
    const maturity = new Date(maturityDate);
    const diffTime = Math.max(0, maturity.getTime() - today.getTime());
    const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    
    const totalPeriods = Math.max(1, Math.ceil(years * periodsPerYear));
    
    const taxDecimal = taxRate / 100;
    const couponDecimal = (couponRate / 100) / periodsPerYear;
    const commissionDecimal = bankCommission / 1000; // Per mille

    // Time 0
    const purchaseCost = (currentPrice / 100) * nominal;
    const buyCommission = nominal * commissionDecimal;
    
    let currentCumulative = 0;
    const t0Outflows: CashFlowDetail[] = [
      { label: 'Costo Acquisto', value: purchaseCost },
      { label: 'Commissione Banca', value: buyCommission }
    ];
    
    const t0Inflows: CashFlowDetail[] = [];
    // Only show nominal if it's real OR if showNominal is true
    if (includeNominalAtT0) {
      t0Inflows.push({ label: 'Nominale', value: nominal, isFigurative: false });
    } else if (showNominal) {
      t0Inflows.push({ label: 'Nominale', value: nominal, isFigurative: true });
    }

    const t0Negative = -(purchaseCost + buyCommission);
    const t0Positive = t0Inflows.reduce((s, d) => s + d.value, 0);
    
    // Cumulative logic: only real flows
    const t0RealInflow = includeNominalAtT0 ? nominal : 0;
    currentCumulative = t0RealInflow + t0Negative;

    data.push({
      time: 'T0',
      positive: t0Positive,
      negative: t0Negative,
      cumulative: currentCumulative,
      label: 'Acquisto & Nominale',
      details: { inflows: t0Inflows, outflows: t0Outflows }
    });

    // Periods 1 to N
    for (let i = 1; i <= totalPeriods; i++) {
      const isLast = i === totalPeriods;
      const grossCoupon = nominal * couponDecimal;
      const couponTax = grossCoupon * taxDecimal;
      
      const inflows: CashFlowDetail[] = [{ label: 'Cedola', value: grossCoupon }];
      const outflows: CashFlowDetail[] = [{ label: 'Tassazione Cedola', value: couponTax }];

      if (isLast) {
        // Capital gain tax
        const capitalGain = (sellingPrice - currentPrice) / 100 * nominal;
        const capGainTax = capitalGain > 0 ? capitalGain * taxDecimal : 0;
        
        inflows.push({ label: 'Rimborso Nominale', value: nominal });
        if (capGainTax > 0) {
          outflows.push({ label: 'Tassa Capital Gain', value: capGainTax });
        }
        
        // Bank commission at maturity depends on sellAtMaturity parameter
        if (!sellAtMaturity) {
          const sellCommission = nominal * commissionDecimal;
          outflows.push({ label: 'Commissione Banca', value: sellCommission });
        }
      }

      const pos = inflows.reduce((s, d) => s + d.value, 0);
      const neg = -outflows.reduce((s, d) => s + d.value, 0);
      
      currentCumulative += (pos + neg);

      data.push({
        time: periodicity === 'annual' ? `A${i}` : `S${i}`,
        positive: pos,
        negative: neg,
        cumulative: currentCumulative,
        label: isLast ? 'Scadenza' : (periodicity === 'annual' ? `Anno ${i}` : `Semestre ${i}`),
        details: { inflows, outflows }
      });
    }

    return data;
  }, [nominal, currentPrice, sellingPrice, taxRate, couponRate, bankCommission, periodicity, maturityDate, includeNominalAtT0, sellAtMaturity, showNominal]);

  const totalPositive = cashFlows.reduce((sum, item, idx) => {
    // Count nominal only at maturity (last item) for actual profit calculation
    // T0 nominal is figurative unless includeNominalAtT0 is true
    const realInflow = item.details.inflows.reduce((s, d) => s + (d.isFigurative ? 0 : d.value), 0);
    return sum + realInflow;
  }, 0);

  const totalNegative = Math.abs(cashFlows.reduce((sum, item) => sum + item.negative, 0));
  const netProfit = totalPositive - totalNegative;
  
  // Initial investment is the purchase cost at T0
  const initialInvestment = Math.abs(cashFlows[0]?.negative || 1);
  const totalReturnPercent = (netProfit / initialInvestment) * 100;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="border-b border-black/5 bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md bg-white/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <TrendingUp size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">BondFlow</h1>
            <p className="text-xs text-black/40 font-medium uppercase tracking-wider">Visualizzatore Flusso di Cassa</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <div className="text-right">
            <p className="text-[10px] text-black/40 uppercase font-bold tracking-widest">Rendimento Totale</p>
            <p className={cn("text-lg font-mono font-bold", totalReturnPercent >= 0 ? "text-emerald-600" : "text-red-600")}>
              {totalReturnPercent >= 0 ? '+' : ''}{totalReturnPercent.toFixed(2)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-black/40 uppercase font-bold tracking-widest">Profitto Netto</p>
            <p className={cn("text-lg font-mono font-bold", netProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
              € {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Inputs */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-black/5">
              <Info size={18} className="text-emerald-600" />
              <h2 className="font-bold text-sm uppercase tracking-wider">Parametri Obbligazione</h2>
            </div>

            <div className="space-y-4">
              <InputGroup 
                label="Nominale" 
                icon={<Banknote size={16} />} 
                value={nominal} 
                onChange={setNominal} 
                suffix="€"
              />
              <div className="grid grid-cols-2 gap-4">
                <InputGroup 
                  label="Prezzo Acquisto" 
                  icon={<Wallet size={16} />} 
                  value={currentPrice} 
                  onChange={setCurrentPrice} 
                  suffix="%"
                />
                <InputGroup 
                  label="Prezzo Vendita" 
                  icon={<ArrowRightLeft size={16} />} 
                  value={sellingPrice} 
                  onChange={setSellingPrice} 
                  suffix="%"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup 
                  label="Cedola Anno" 
                  icon={<Percent size={16} />} 
                  value={couponRate} 
                  onChange={setCouponRate} 
                  suffix="%"
                />
                <InputGroup 
                  label="Tasse" 
                  icon={<Percent size={16} />} 
                  value={taxRate} 
                  onChange={setTaxRate} 
                  suffix="%"
                />
              </div>
              <InputGroup 
                label="Commissioni Banca" 
                icon={<Percent size={16} />} 
                value={bankCommission} 
                onChange={setBankCommission} 
                suffix="‰"
              />
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-black/40 uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={14} /> Data Scadenza
                </label>
                <input 
                  type="date" 
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-black/40 uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={14} /> Periodicità
                </label>
                <select 
                  value={periodicity}
                  onChange={(e) => setPeriodicity(e.target.value as 'annual' | 'semiannual')}
                  className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500 transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="annual">Annuale</option>
                  <option value="semiannual">Semestrale</option>
                </select>
              </div>

              <div className="pt-4 space-y-4 border-t border-black/5">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={showCumulative}
                      onChange={(e) => setShowCumulative(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-5 bg-black/10 rounded-full peer-checked:bg-emerald-600 transition-colors" />
                    <div className="absolute left-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform shadow-sm" />
                  </div>
                  <span className="text-xs font-bold text-black/60 uppercase tracking-wider">Mostra Cumulata</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={showNominal}
                      onChange={(e) => setShowNominal(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-5 bg-black/10 rounded-full peer-checked:bg-emerald-600 transition-colors" />
                    <div className="absolute left-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform shadow-sm" />
                  </div>
                  <span className="text-xs font-bold text-black/60 uppercase tracking-wider">Mostra Nominale</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={includeNominalAtT0}
                      onChange={(e) => setIncludeNominalAtT0(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-5 bg-black/10 rounded-full peer-checked:bg-emerald-600 transition-colors" />
                    <div className="absolute left-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform shadow-sm" />
                  </div>
                  <span className="text-xs font-bold text-black/60 uppercase tracking-wider">Nominale T0 Reale</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={sellAtMaturity}
                      onChange={(e) => setSellAtMaturity(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-10 h-5 bg-black/10 rounded-full peer-checked:bg-emerald-600 transition-colors" />
                    <div className="absolute left-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform shadow-sm" />
                  </div>
                  <span className="text-xs font-bold text-black/60 uppercase tracking-wider">Vendita a Scadenza</span>
                </label>
              </div>
            </div>
          </section>

          {/* Summary Card */}
          <section className="bg-emerald-900 text-white rounded-2xl p-6 shadow-xl shadow-emerald-900/20 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">Riepilogo Totale</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-xs opacity-70">Entrate Totali</span>
                <span className="font-mono font-bold">€ {totalPositive.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-xs opacity-70">Uscite Totali</span>
                <span className="font-mono font-bold text-emerald-300">€ {totalNegative.toLocaleString()}</span>
              </div>
              <div className="h-px bg-white/10 my-2" />
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold">Guadagno Netto</span>
                <span className="text-xl font-mono font-bold text-emerald-400">
                  € {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </section>
        </aside>

        {/* Chart Area */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-6">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5 h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="relative">
                <h2 className="text-4xl font-black tracking-tighter text-black uppercase italic leading-none">
                  Flusso <span className="text-emerald-600">di</span> Cassa
                </h2>
                <div className="h-1 w-12 bg-emerald-600 mt-2 rounded-full" />
                <p className="text-[10px] font-bold text-black/30 uppercase tracking-[0.3em] mt-2">Analisi Temporale & Break-even</p>
              </div>
              <div className="flex gap-4 items-center text-[10px] font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
                  <span>Nominale T0 (Figurativo)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <span>Entrate Reali</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-red-500" />
                  <span>Uscite Reali</span>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cashFlows}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  stackOffset="sign"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00000010" />
                  <XAxis 
                    dataKey="time" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 600, fill: '#00000040' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 600, fill: '#00000040' }}
                    tickFormatter={(value) => `€${value.toLocaleString()}`}
                  />
                  <Tooltip 
                    cursor={{ fill: '#00000005' }}
                    content={<CustomTooltip />}
                  />
                  <ReferenceLine y={0} stroke="#00000020" />
                  
                  <Bar dataKey="positive" stackId="stack">
                    {cashFlows.map((entry, index) => (
                      <Cell 
                        key={`cell-pos-${index}`} 
                        fill={index === 0 ? '#10B98133' : '#10B981'} 
                        stroke={index === 0 ? '#10B981' : 'none'}
                        strokeWidth={index === 0 ? 1 : 0}
                        radius={index === 0 ? [4, 4, 0, 0] : [2, 2, 0, 0]}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="negative" stackId="stack">
                    {cashFlows.map((entry, index) => (
                      <Cell 
                        key={`cell-neg-${index}`} 
                        fill={'#EF4444'} 
                        stroke={'none'}
                        strokeWidth={0}
                        radius={[0, 0, 4, 4]}
                      />
                    ))}
                  </Bar>

                  {showCumulative && (
                    <Line 
                      type="monotone" 
                      dataKey="cumulative" 
                      stroke="#2563eb" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-black/5 bg-black/[0.02]">
              <h3 className="text-xs font-bold uppercase tracking-widest text-black/40">Dettaglio Flussi</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-black/40 border-b border-black/5">
                    <th className="px-6 py-4">Periodo</th>
                    <th className="px-6 py-4">Descrizione</th>
                    <th className="px-6 py-4 text-right">Entrate</th>
                    <th className="px-6 py-4 text-right">Uscite</th>
                    <th className="px-6 py-4 text-right">Netto</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium">
                  {cashFlows.map((cf, idx) => (
                    <React.Fragment key={idx}>
                      <tr className="border-b border-black/5 hover:bg-black/[0.01] transition-colors">
                        <td className="px-6 py-4 font-mono text-xs align-top">{cf.time}</td>
                        <td className="px-6 py-4 text-black/60 align-top">
                          <div className="font-bold text-black">{cf.label}</div>
                          <div className="mt-2 space-y-1">
                            {cf.details.inflows.map((inf, i) => (
                              <div key={i} className="text-[10px] flex justify-between gap-4">
                                <span>{inf.label} {inf.isFigurative && <span className="text-black/30 italic">(Figurativo)</span>}</span>
                                <span className="text-emerald-600">€ {inf.value.toLocaleString()}</span>
                              </div>
                            ))}
                            {cf.details.outflows.map((out, i) => (
                              <div key={i} className="text-[10px] flex justify-between gap-4">
                                <span>{out.label}</span>
                                <span className="text-red-500">€ {out.value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-600 align-top">€ {cf.positive.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-red-500 align-top">€ {Math.abs(cf.negative).toLocaleString()}</td>
                        <td className={cn("px-6 py-4 text-right font-bold align-top", (cf.positive + cf.negative) >= 0 ? "text-emerald-600" : "text-red-600")}>
                          € {(cf.positive + cf.negative).toLocaleString()}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function InputGroup({ label, icon, value, onChange, suffix }: { 
  label: string, 
  icon: React.ReactNode, 
  value: number, 
  onChange: (v: number) => void,
  suffix?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-black/40 uppercase tracking-wider flex items-center gap-2">
        {icon} {label}
      </label>
      <div className="relative group">
        <input 
          type="number" 
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-black/5 border-none rounded-xl px-4 py-3 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-black/20 group-focus-within:text-emerald-500 transition-colors">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const pos = payload.find((p: any) => p.dataKey === 'positive')?.value || 0;
    const neg = payload.find((p: any) => p.dataKey === 'negative')?.value || 0;
    const data = payload[0].payload as CashFlowData;

    return (
      <div className="bg-white p-4 rounded-xl shadow-2xl border border-black/5 min-w-[240px]">
        <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest mb-3">{data.label}</p>
        
        <div className="space-y-3">
          {/* Inflows Detail */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Entrate</p>
            {data.details.inflows.map((inf, i) => (
              <div key={i} className="flex justify-between items-center text-[11px]">
                <span className="text-black/60">{inf.label} {inf.isFigurative && <span className="text-[9px] text-black/30 italic">(Fig.)</span>}</span>
                <span className="font-mono font-bold text-emerald-600">€ {inf.value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Outflows Detail */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Uscite</p>
            {data.details.outflows.map((out, i) => (
              <div key={i} className="flex justify-between items-center text-[11px]">
                <span className="text-black/60">{out.label}</span>
                <span className="font-mono font-bold text-red-500">€ {out.value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-black/5 my-2" />
          
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold">Saldo Netto</span>
            <span className={cn("text-sm font-mono font-bold", (pos + neg) >= 0 ? "text-emerald-600" : "text-red-600")}>
              € {(pos + neg).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-blue-700">Cumulata</span>
            <span className={cn("text-sm font-mono font-bold text-blue-700")}>
              € {data.cumulative.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
