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

/** Toggle visivamente affidabile anche su browser TV - usa left invece di transform */
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group shrink-0">
      <div className="relative flex items-center shrink-0 overflow-visible" style={{ width: 40, height: 20 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div className={cn("w-10 h-5 rounded-full transition-colors", checked ? "bg-emerald-600" : "bg-black/10")} />
        <div
          className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-[left] duration-200"
          style={{ left: checked ? 20 : 4 }}
        />
      </div>
      <span className="text-xs font-bold text-black/60 uppercase tracking-wider">{label}</span>
    </label>
  );
}

/** Rileva browser LG Smart TV (Web0S, SmartTV, LG Browser) per ottimizzazioni visualizzazione */
function isLgTvBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Web0S|SmartTV|LG Browser|Large Screen/i.test(ua);
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
  const [isMounted, setIsMounted] = useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Input states
  const [nominal, setNominal] = useState<number>(10000);
  const [currentPrice, setCurrentPrice] = useState<number>(98.5);
  const [sellingPrice, setSellingPrice] = useState<number>(100);
  const [taxRate, setTaxRate] = useState<number>(12.5); // Default for government bonds in Italy
  const [couponRate, setCouponRate] = useState<number>(3.5);
  const [bankCommission, setBankCommission] = useState<number>(2); // 2 per mille default
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

  const durationYears = useMemo(() => {
    const today = new Date();
    const maturity = new Date(maturityDate);
    const diffTime = Math.max(0, maturity.getTime() - today.getTime());
    return diffTime / (1000 * 60 * 60 * 24 * 365.25);
  }, [maturityDate]);

  const cashFlows = useMemo(() => {
    const data: CashFlowData[] = [];
    const periodsPerYear = periodicity === 'annual' ? 1 : 2;
    
    const totalPeriods = Math.max(1, Math.ceil(durationYears * periodsPerYear));
    
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
  }, [nominal, currentPrice, sellingPrice, taxRate, couponRate, bankCommission, periodicity, durationYears, includeNominalAtT0, sellAtMaturity, showNominal]);

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
  const avgAnnualReturn = durationYears > 0 ? totalReturnPercent / durationYears : totalReturnPercent;

  const lgTv = isLgTvBrowser();

  return (
    <div 
      className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100"
      data-lg-tv={lgTv ? 'true' : undefined}
    >
      {/* Header */}
      <header className={cn(
        "sticky top-0 z-50 border-b border-black/5 px-4 sm:px-8 py-4 flex items-center justify-between",
        lgTv ? "bg-white" : "bg-white/80 backdrop-blur-md"
      )}>
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="bg-emerald-600 p-2 sm:p-2.5 rounded-xl shadow-lg shadow-emerald-600/20">
            <TrendingUp className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tighter text-black leading-none">BondFlow</h1>
            <p className="text-[9px] sm:text-[10px] text-black/40 uppercase font-bold tracking-widest mt-1">Visualizzatore Flusso di Cassa</p>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-8">
          <div className="text-right">
            <p className="text-[8px] sm:text-[10px] text-black/40 uppercase font-bold tracking-widest">Rendimento Annuo</p>
            <p className={cn("text-sm sm:text-lg font-mono font-bold leading-none mt-1", avgAnnualReturn >= 0 ? "text-emerald-600" : "text-red-600")}>
              {avgAnnualReturn >= 0 ? '+' : ''}{avgAnnualReturn.toFixed(2)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[8px] sm:text-[10px] text-black/40 uppercase font-bold tracking-widest">Rendimento</p>
            <p className={cn("text-sm sm:text-lg font-mono font-bold leading-none mt-1", totalReturnPercent >= 0 ? "text-emerald-600" : "text-red-600")}>
              {totalReturnPercent >= 0 ? '+' : ''}{totalReturnPercent.toFixed(2)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[8px] sm:text-[10px] text-black/40 uppercase font-bold tracking-widest">Profitto</p>
            <p className={cn("text-sm sm:text-lg font-mono font-bold leading-none mt-1", netProfit >= 0 ? "text-emerald-600" : "text-red-600")}>
              € {netProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
        {/* Sidebar Inputs */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-6">
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 space-y-6 overflow-visible">
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

              <div className="pt-4 space-y-4 border-t border-black/5 overflow-visible">
                <Toggle checked={showCumulative} onChange={setShowCumulative} label="Mostra Cumulata" />
                <Toggle checked={showNominal} onChange={setShowNominal} label="Mostra Nominale" />
                <Toggle checked={includeNominalAtT0} onChange={setIncludeNominalAtT0} label="Nominale T0 Reale" />
                <Toggle checked={sellAtMaturity} onChange={setSellAtMaturity} label="Vendita a Scadenza" />
              </div>
            </div>
          </section>

          {/* Summary Card - contrasto alto per leggibilità */}
          <section className="bg-[#064e3b] text-white rounded-2xl p-6 shadow-xl shadow-emerald-900/20 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Riepilogo Totale</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-xs text-white">Entrate Totali</span>
                <span className="font-mono font-bold text-white">€ {totalPositive.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-xs text-white">Uscite Totali</span>
                <span className="font-mono font-bold text-white">€ {totalNegative.toLocaleString()}</span>
              </div>
              <div className="h-px bg-white/30 my-2" />
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-white">Guadagno Netto</span>
                <span className="text-xl font-mono font-bold text-white">
                  € {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </section>
        </aside>

        {/* Chart Area */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-6">
          <div className="bg-white rounded-2xl p-4 sm:p-8 shadow-sm border border-black/5 h-[550px] sm:h-[600px] flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
              <div className="relative">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-black uppercase italic leading-none">
                  Flusso <span className="text-emerald-600">di</span> Cassa
                </h2>
                <div className="h-1 w-12 bg-emerald-600 mt-2 rounded-full" />
                <p className="text-[10px] font-bold text-black/30 uppercase tracking-[0.3em] mt-2">Analisi Temporale & Break-even</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
                  <span>Nominale T0 (Fig.)</span>
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

            <div className="flex-1 relative">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={cashFlows}
                    margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
                    stackOffset="sign"
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00000010" />
                    <XAxis 
                      dataKey="time" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: lgTv ? 16 : 11, fontWeight: 600, fill: '#00000040' }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: lgTv ? 16 : 11, fontWeight: 600, fill: '#00000040' }}
                      tickFormatter={(value) => `€${value.toLocaleString()}`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#00000005' }}
                      content={<CustomTooltip lgTv={lgTv} />}
                    />
                    <ReferenceLine y={0} stroke="#00000020" />
                    
                    <Bar dataKey="positive" stackId="stack">
                      {cashFlows.map((entry, index) => (
                        <Cell 
                          key={`cell-pos-${index}`} 
                          fill={entry.details.inflows.some(inf => inf.isFigurative) ? '#10B98133' : '#10B981'} 
                          stroke={entry.details.inflows.some(inf => inf.isFigurative) ? '#10B981' : 'none'}
                          strokeWidth={entry.details.inflows.some(inf => inf.isFigurative) ? 1 : 0}
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
              )}
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-black/5 flex items-center justify-between bg-black/[0.02]">
              <h3 className="text-[11px] font-bold text-black/40 uppercase tracking-[0.2em]">Dettaglio Flussi</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px] sm:min-w-0">
                <thead>
                  <tr className="bg-black/[0.02] border-b border-black/5">
                    <th className="px-4 sm:px-6 py-4 text-[10px] font-bold text-black/40 uppercase tracking-widest">Periodo</th>
                    <th className="px-4 sm:px-6 py-4 text-[10px] font-bold text-black/40 uppercase tracking-widest">Descrizione</th>
                    <th className="px-4 sm:px-6 py-4 text-[10px] font-bold text-black/40 uppercase tracking-widest text-right">Entrate</th>
                    <th className="px-4 sm:px-6 py-4 text-[10px] font-bold text-black/40 uppercase tracking-widest text-right">Uscite</th>
                    <th className="px-4 sm:px-6 py-4 text-[10px] font-bold text-black/40 uppercase tracking-widest text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {cashFlows.map((cf, idx) => (
                    <React.Fragment key={idx}>
                      <tr className="hover:bg-black/[0.01] transition-colors">
                        <td className="px-4 sm:px-6 py-4 font-mono text-xs font-bold text-black/40 align-top">{cf.time}</td>
                        <td className="px-4 sm:px-6 py-4 align-top">
                          <div className="font-bold text-black text-sm sm:text-base">{cf.label}</div>
                          <div className="mt-2 space-y-1">
                            {cf.details.inflows.map((inf, i) => (
                              <div key={i} className="text-[9px] sm:text-[10px] flex justify-between gap-4">
                                <span className="text-black/60">{inf.label} {inf.isFigurative && <span className="text-black/30 italic">(Fig.)</span>}</span>
                                <span className="text-emerald-600 font-mono">€ {inf.value.toLocaleString()}</span>
                              </div>
                            ))}
                            {cf.details.outflows.map((out, i) => (
                              <div key={i} className="text-[9px] sm:text-[10px] flex justify-between gap-4">
                                <span className="text-black/60">{out.label}</span>
                                <span className="text-red-500 font-mono">€ {out.value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-right text-emerald-600 align-top font-mono text-xs sm:text-sm">€ {cf.positive.toLocaleString()}</td>
                        <td className="px-4 sm:px-6 py-4 text-right text-red-500 align-top font-mono text-xs sm:text-sm">€ {Math.abs(cf.negative).toLocaleString()}</td>
                        <td className={cn("px-4 sm:px-6 py-4 text-right font-bold align-top font-mono text-xs sm:text-sm", (cf.positive + cf.negative) >= 0 ? "text-emerald-600" : "text-red-600")}>
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

function CustomTooltip({ active, payload, lgTv }: { active?: boolean; payload?: any[]; lgTv?: boolean }) {
  if (active && payload && payload.length > 0) {
    const pos = payload.find((p: any) => p.dataKey === 'positive')?.value || 0;
    const neg = payload.find((p: any) => p.dataKey === 'negative')?.value || 0;
    const data = payload[0].payload as CashFlowData;
    if (!data) return null;
    const textCls = lgTv ? 'text-sm' : 'text-[10px]';
    const detailCls = lgTv ? 'text-xs' : 'text-[9px]';
    const valueCls = lgTv ? 'text-sm' : 'text-[11px]';

    return (
      <div className={cn("bg-white p-4 rounded-xl shadow-2xl border border-black/5", lgTv ? "min-w-[280px]" : "min-w-[240px]")}>
        <p className={cn("font-bold text-black/40 uppercase tracking-widest mb-3", textCls)}>{data.label}</p>
        
        <div className="space-y-3">
          {/* Inflows Detail */}
          <div className="space-y-1">
            <p className={cn("font-bold text-emerald-600 uppercase tracking-wider", detailCls)}>Entrate</p>
            {data.details.inflows.map((inf, i) => (
              <div key={i} className={cn("flex justify-between items-center", valueCls)}>
                <span className="text-black/60">{inf.label} {inf.isFigurative && <span className={cn("text-black/30 italic", detailCls)}>(Fig.)</span>}</span>
                <span className="font-mono font-bold text-emerald-600">€ {inf.value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Outflows Detail */}
          <div className="space-y-1">
            <p className={cn("font-bold text-red-500 uppercase tracking-wider", detailCls)}>Uscite</p>
            {data.details.outflows.map((out, i) => (
              <div key={i} className={cn("flex justify-between items-center", valueCls)}>
                <span className="text-black/60">{out.label}</span>
                <span className="font-mono font-bold text-red-500">€ {out.value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-black/5 my-2" />
          
          <div className={cn("flex justify-between items-center", lgTv ? "text-sm" : "text-xs")}>
            <span className="font-bold">Saldo Netto</span>
            <span className={cn("font-mono font-bold", lgTv ? "text-base" : "text-sm", (pos + neg) >= 0 ? "text-emerald-600" : "text-red-600")}>
              € {(pos + neg).toLocaleString()}
            </span>
          </div>
          <div className={cn("flex justify-between items-center", lgTv ? "text-sm" : "text-xs")}>
            <span className="font-bold text-blue-700">Cumulata</span>
            <span className={cn("font-mono font-bold text-blue-700", lgTv ? "text-base" : "text-sm")}>
              € {data.cumulative.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
