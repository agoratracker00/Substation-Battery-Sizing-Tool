'use client';

import React, { useState, useMemo } from 'react';
import { 
  Battery, 
  Zap, 
  Clock, 
  Thermometer, 
  ShieldCheck, 
  Calculator,
  Info,
  AlertTriangle,
  BookOpen,
  Settings2,
  Copy,
  CheckCircle2,
  Lightbulb,
  ClipboardList,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer
} from 'recharts';

export default function SubstationBatteryTool() {
  // --- State: System Parameters ---
  const [acVoltage, setAcVoltage] = useState<string>('138'); // AC Voltage Context
  const [voltage, setVoltage] = useState<number>(125); // Standard 125V DC
  const [chemistry, setChemistry] = useState<string>('VLA'); // VLA, VRLA, NiCd

  // --- State: Load Profile ---
  const [loadUnit, setLoadUnit] = useState<'A' | 'kW'>('A');
  const [durationHrs, setDurationHrs] = useState<string>('8'); // Standard 8 hours
  const [continuousLoad, setContinuousLoad] = useState<string>('10'); // SCADA, Relays, Indicators
  const [nonContinuousLoad, setNonContinuousLoad] = useState<string>('15'); // Emergency lighting, pumps
  const [momentaryLoad, setMomentaryLoad] = useState<string>('40'); // Breaker trip/close coils (usually 1 min)

  // --- State: Correction Factors (IEEE 485) ---
  const [designMargin, setDesignMargin] = useState<number>(1.10); // 10% margin
  const [agingFactor, setAgingFactor] = useState<number>(1.25); // 25% (1 / 0.8)
  const [tempFactor, setTempFactor] = useState<number>(1.11); // 1.11 for 15°C (59°F)

  // --- State: UI ---
  const [copied, setCopied] = useState(false);
  const [showMath, setShowMath] = useState(false);

  // --- Presets ---
  const applyPreset = (size: 'small' | 'medium' | 'large') => {
    let c = 0, nc = 0, m = 0;
    if (size === 'small') { c = 5; nc = 10; m = 30; setAcVoltage('69'); }
    else if (size === 'medium') { c = 15; nc = 25; m = 60; setAcVoltage('138'); }
    else if (size === 'large') { c = 35; nc = 50; m = 120; setAcVoltage('345'); }
    
    if (loadUnit === 'kW') {
      setContinuousLoad(((c * voltage) / 1000).toFixed(3).replace(/\.?0+$/, ''));
      setNonContinuousLoad(((nc * voltage) / 1000).toFixed(3).replace(/\.?0+$/, ''));
      setMomentaryLoad(((m * voltage) / 1000).toFixed(3).replace(/\.?0+$/, ''));
    } else {
      setContinuousLoad(c.toString());
      setNonContinuousLoad(nc.toString());
      setMomentaryLoad(m.toString());
    }
    setDurationHrs('8');
  };

  // --- Unit Toggle ---
  const handleUnitToggle = (newUnit: 'A' | 'kW') => {
    if (newUnit === loadUnit) return;
    
    const convert = (valStr: string) => {
      const val = parseFloat(valStr);
      if (isNaN(val)) return valStr;
      
      if (newUnit === 'kW') {
        return ((val * voltage) / 1000).toFixed(3).replace(/\.?0+$/, '');
      } else {
        return ((val * 1000) / voltage).toFixed(1).replace(/\.?0+$/, '');
      }
    };

    setContinuousLoad(convert(continuousLoad));
    setNonContinuousLoad(convert(nonContinuousLoad));
    setMomentaryLoad(convert(momentaryLoad));
    setLoadUnit(newUnit);
  };

  // --- Validation ---
  const validateInput = (valStr: string, isDuration = false) => {
    if (valStr.trim() === '') return 'Required';
    const val = parseFloat(valStr);
    if (isNaN(val)) return 'Invalid number';
    if (val < 0) return 'Cannot be negative';
    if (isDuration && val <= 0) return 'Must be > 0';
    return null;
  };

  const errC = validateInput(continuousLoad);
  const errNC = validateInput(nonContinuousLoad);
  const errM = validateInput(momentaryLoad);
  const errD = validateInput(durationHrs, true);

  // --- Calculations ---
  const results = useMemo(() => {
    const getAmps = (valStr: string) => {
      const val = parseFloat(valStr);
      if (isNaN(val) || val < 0) return 0;
      return loadUnit === 'A' ? val : (val * 1000) / voltage;
    };

    const cAmps = getAmps(continuousLoad);
    const ncAmps = getAmps(nonContinuousLoad);
    const mAmps = getAmps(momentaryLoad);
    const dHrs = parseFloat(durationHrs) || 0;

    // 1. Calculate Base Ampere-Hours (Ah)
    const ahContinuous = cAmps * dHrs;
    const ahNonContinuous = ncAmps * dHrs;
    const ahMomentary = mAmps * (1 / 60); // Assuming 1 minute duration for momentary loads

    const baseAh = ahContinuous + ahNonContinuous + ahMomentary;

    // 2. Apply IEEE 485 Correction Factors
    const correctedAh = baseAh * designMargin * agingFactor * tempFactor;

    // 3. Cell Configuration
    let cells = 60;
    let floatVpc = 2.25;
    let endVpc = 1.75;

    if (chemistry === 'VLA' || chemistry === 'VRLA') {
      cells = voltage === 125 ? 60 : voltage === 48 ? 24 : 120;
      floatVpc = chemistry === 'VLA' ? 2.25 : 2.27;
      endVpc = 1.75;
    } else if (chemistry === 'NiCd') {
      cells = voltage === 125 ? 92 : voltage === 48 ? 37 : 184;
      floatVpc = 1.42;
      endVpc = 1.14;
    }

    const floatVoltage = cells * floatVpc;
    const endVoltage = cells * endVpc;
    const equalizeVpc = chemistry === 'NiCd' ? 1.55 : (chemistry === 'VLA' ? 2.33 : 2.27); // VRLA rarely equalized, usually same as float or slightly higher
    const equalizeVoltage = cells * equalizeVpc;

    // 4. Chart Data
    const chartData = [
      {
        name: 'Base Load (Ah)',
        Continuous: parseFloat(ahContinuous.toFixed(1)),
        'Non-Continuous': parseFloat(ahNonContinuous.toFixed(1)),
        Momentary: parseFloat(ahMomentary.toFixed(1)),
        Margin: 0,
        Aging: 0,
        Temperature: 0,
      },
      {
        name: 'Final Required (Ah)',
        Continuous: parseFloat(ahContinuous.toFixed(1)),
        'Non-Continuous': parseFloat(ahNonContinuous.toFixed(1)),
        Momentary: parseFloat(ahMomentary.toFixed(1)),
        Margin: parseFloat((baseAh * (designMargin - 1)).toFixed(1)),
        Aging: parseFloat((baseAh * designMargin * (agingFactor - 1)).toFixed(1)),
        Temperature: parseFloat((baseAh * designMargin * agingFactor * (tempFactor - 1)).toFixed(1)),
      }
    ];

    return {
      baseAh,
      correctedAh,
      chartData,
      cells,
      floatVoltage,
      endVoltage,
      equalizeVoltage,
      cAmps,
      ncAmps,
      mAmps,
      dHrs
    };
  }, [voltage, chemistry, continuousLoad, nonContinuousLoad, momentaryLoad, durationHrs, designMargin, agingFactor, tempFactor, loadUnit]);

  // --- Copy Summary ---
  const handleCopy = () => {
    const summary = `
[Substation DC Battery Sizing Summary]
AC System: ${acVoltage}kV
DC System: ${voltage}V DC, ${chemistry} (${results.cells} cells)
Float Voltage: ${results.floatVoltage.toFixed(1)}V
Equalize Voltage: ${results.equalizeVoltage.toFixed(1)}V
End Voltage: ${results.endVoltage.toFixed(1)}V

1. Load Profile (${results.dHrs} Hours):
- Continuous: ${results.cAmps.toFixed(1)} A
- Non-Continuous: ${results.ncAmps.toFixed(1)} A
- Momentary (1 min): ${results.mAmps.toFixed(1)} A
=> Base Capacity: ${results.baseAh.toFixed(1)} Ah

2. IEEE 485 Correction Factors:
- Design Margin: ${(designMargin * 100 - 100).toFixed(0)}%
- Aging Factor: ${agingFactor} (End of life at 80%)
- Temp Factor: ${tempFactor}

=> FINAL REQUIRED CAPACITY: ${results.correctedAh.toFixed(0)} Ah
    `.trim();
    
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0f1115] text-slate-300 font-sans selection:bg-blue-500/30 pb-12">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#15181e] px-6 py-4 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Battery className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Substation DC Battery Sizing</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-slate-500 font-mono">Simplified IEEE 485 Implementation</p>
                <span className="text-slate-700 text-xs">•</span>
                <p className="text-xs text-blue-400/80 font-medium">Created by Jon Park, PE</p>
              </div>
            </div>
          </div>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 mt-4">
        
        {/* Intro for Juniors */}
        <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-5 mb-8 flex gap-4 items-start">
          <Info className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-blue-300 mb-1">Guide for Junior Engineers</h2>
            <p className="text-sm text-blue-200/70 leading-relaxed">
              Welcome! This tool helps you size the stationary DC battery bank for substations (used for protection relays, SCADA, and switchgear). 
              Follow the 3 steps below. If you&apos;re unsure where to start, use one of the <strong>Typical Presets</strong> to load standard values.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <button onClick={() => applyPreset('small')} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors text-left group">
                <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Small Substation</div>
                <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">1 Transformer, Simple/Radial Bus, ~4 Feeder Breakers.</div>
              </button>
              <button onClick={() => applyPreset('medium')} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors text-left group">
                <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Medium Substation</div>
                <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">2 Transformers, Ring Bus or Main-Tie-Main, ~8-10 Feeders.</div>
              </button>
              <button onClick={() => applyPreset('large')} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors text-left group">
                <div className="text-sm font-semibold text-slate-200 group-hover:text-white">Large Substation</div>
                <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">Transmission Switching, Breaker-and-a-Half, Extensive SCADA.</div>
              </button>
            </div>

            <div className="mt-4 flex gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-amber-400">AC vs DC Loads (Control House):</strong> HVAC (Air Conditioning), normal lighting, and wall outlets are <strong>AC loads</strong> powered by the Station Service Transformer. They are <strong>NOT</strong> included in this DC battery sizing. The battery only powers critical DC equipment (Relays, Breaker Coils, SCADA). <em>Note: If AC fails, the HVAC stops, which is why we must apply the <strong>Min Temp Factor</strong> for a cold battery room!</em>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Step 1: System Config */}
            <div className="bg-[#15181e] border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              <div className="flex items-center gap-2 mb-5">
                <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded">STEP 1</span>
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-emerald-400" /> System Config
                </h2>
              </div>
              
              <div className="space-y-4">
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 mb-4">
                  <div className="flex gap-2">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-300">
                      <strong className="text-slate-200">AC System Voltage</strong> (e.g., 138kV) indicates the substation&apos;s size and class. While it doesn&apos;t directly change the DC math, higher AC voltages typically mean more breakers, larger equipment, and thus higher DC loads. It is recorded here for your design documentation.
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div>
                    <div className="text-sm font-medium text-slate-300">AC System Voltage</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">For documentation context</div>
                  </div>
                  <select 
                    value={acVoltage} 
                    onChange={(e) => setAcVoltage(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-2 py-1 outline-none focus:border-emerald-500"
                  >
                    <option value="69">69 kV</option>
                    <option value="138">138 kV</option>
                    <option value="230">230 kV</option>
                    <option value="345">345 kV</option>
                    <option value="500">500 kV</option>
                    <option value="765">765 kV</option>
                  </select>
                </div>

                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Nominal DC Voltage</div>
                  </div>
                  <select 
                    value={voltage} 
                    onChange={(e) => setVoltage(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-2 py-1 outline-none focus:border-emerald-500"
                  >
                    <option value={48}>48V DC</option>
                    <option value={125}>125V DC (Standard)</option>
                    <option value={250}>250V DC</option>
                  </select>
                </div>

                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Chemistry</div>
                  </div>
                  <select 
                    value={chemistry} 
                    onChange={(e) => setChemistry(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-2 py-1 outline-none focus:border-emerald-500"
                  >
                    <option value="VLA">VLA (Flooded Lead-Acid)</option>
                    <option value="VRLA">VRLA (Sealed Lead-Acid)</option>
                    <option value="NiCd">Ni-Cd (Nickel-Cadmium)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Step 2: Load Profile */}
            <div className="bg-[#15181e] border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
              <div className="flex items-center gap-2 mb-5">
                <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded">STEP 2</span>
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" /> Load Profile
                </h2>
              </div>
              
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs text-slate-400">Enter load values below:</div>
                  <div className="bg-slate-800 p-1 rounded-lg inline-flex">
                    <button onClick={() => handleUnitToggle('A')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${loadUnit === 'A' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}>Amperes (A)</button>
                    <button onClick={() => handleUnitToggle('kW')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${loadUnit === 'kW' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}>Kilowatts (kW)</button>
                  </div>
                </div>

                <div>
                  <label className="flex justify-between text-xs font-medium text-slate-400 mb-1.5">
                    <span>Continuous Load (L1)</span>
                    {errC && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {errC}</span>}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" min="0" step="any" value={continuousLoad}
                      onChange={(e) => setContinuousLoad(e.target.value)}
                      className={`w-full bg-slate-900 border ${errC ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-amber-500'} text-slate-200 rounded-lg px-3 py-2 outline-none transition-colors`}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-500 text-sm">{loadUnit}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Relays, SCADA, PLC, Indicator lights (Runs full duration)</p>
                </div>

                <div>
                  <label className="flex justify-between text-xs font-medium text-slate-400 mb-1.5">
                    <span>Non-Continuous Load (L2)</span>
                    {errNC && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {errNC}</span>}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" min="0" step="any" value={nonContinuousLoad}
                      onChange={(e) => setNonContinuousLoad(e.target.value)}
                      className={`w-full bg-slate-900 border ${errNC ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-amber-500'} text-slate-200 rounded-lg px-3 py-2 outline-none transition-colors`}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-500 text-sm">{loadUnit}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Emergency lighting, backup motors (Runs full duration)</p>
                </div>

                <div>
                  <label className="flex justify-between text-xs font-medium text-slate-400 mb-1.5">
                    <span>Momentary Load (L3)</span>
                    {errM && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {errM}</span>}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" min="0" step="any" value={momentaryLoad}
                      onChange={(e) => setMomentaryLoad(e.target.value)}
                      className={`w-full bg-slate-900 border ${errM ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-amber-500'} text-slate-200 rounded-lg px-3 py-2 outline-none transition-colors`}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-500 text-sm">{loadUnit}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Breaker trip/close coils, motor starting (Calculated as 1 minute)</p>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <label className="flex justify-between text-xs font-medium text-slate-400 mb-1.5">
                    <span>Backup Duration</span>
                    {errD && <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> {errD}</span>}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" min="1" max="72" step="1" value={durationHrs}
                      onChange={(e) => setDurationHrs(e.target.value)}
                      className={`w-full bg-slate-900 border ${errD ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-amber-500'} text-slate-200 rounded-lg px-3 py-2 outline-none transition-colors`}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-500 text-sm">Hours</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Correction Factors */}
            <div className="bg-[#15181e] border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
              <div className="flex items-center gap-2 mb-5">
                <span className="bg-purple-500/20 text-purple-400 text-xs font-bold px-2 py-0.5 rounded">STEP 3</span>
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-purple-400" /> Sizing Factors
                </h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Design Margin</div>
                  </div>
                  <select 
                    value={designMargin} 
                    onChange={(e) => setDesignMargin(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-2 py-1 outline-none focus:border-purple-500"
                  >
                    <option value={1.00}>0% (1.00)</option>
                    <option value={1.10}>10% (1.10) - Standard</option>
                    <option value={1.15}>15% (1.15)</option>
                    <option value={1.20}>20% (1.20)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Aging Factor</div>
                  </div>
                  <select 
                    value={agingFactor} 
                    onChange={(e) => setAgingFactor(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-2 py-1 outline-none focus:border-purple-500"
                  >
                    <option value={1.00}>None (1.00)</option>
                    <option value={1.25}>25% (1.25) - Standard</option>
                  </select>
                </div>
                
                {/* Pro Tip for Aging */}
                <div className="flex gap-2 px-2 text-[10px] text-slate-400">
                  <Lightbulb className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                  <p><strong>Pro Tip:</strong> IEEE recommends replacing batteries when capacity drops to 80%. We size them 25% larger initially (1 / 0.8 = 1.25) so they still meet the load at end-of-life.</p>
                </div>

                <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 mt-4">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Min Temp Factor</div>
                  </div>
                  <select 
                    value={tempFactor} 
                    onChange={(e) => setTempFactor(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-2 py-1 outline-none focus:border-purple-500"
                  >
                    <option value={1.00}>25°C / 77°F (1.00)</option>
                    <option value={1.04}>20°C / 68°F (1.04)</option>
                    <option value={1.11}>15°C / 59°F (1.11)</option>
                    <option value={1.19}>10°C / 50°F (1.19)</option>
                  </select>
                </div>

                <div className="flex gap-2 px-2 text-[10px] text-slate-400">
                  <Lightbulb className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />
                  <p><strong>Pro Tip:</strong> Battery capacity drops in cold temperatures. Always size for the lowest expected ambient temperature in the battery room.</p>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Results & Chart */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Results Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#15181e] border border-slate-800 rounded-xl p-5 shadow-xl">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" /> Base Capacity
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-mono font-semibold text-slate-300">{results.baseAh.toFixed(0)}</span>
                  <span className="text-sm font-medium text-slate-500">Ah</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Raw capacity required for the duty cycle before applying safety factors.</p>
              </div>

              <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-5 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <ShieldCheck className="w-16 h-16 text-blue-400" />
                </div>
                <h3 className="text-xs font-medium text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Required Rating
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-mono font-bold text-blue-400">{results.correctedAh.toFixed(0)}</span>
                  <span className="text-sm font-medium text-blue-500">Ah</span>
                </div>
                <p className="text-[10px] text-blue-200/60 mt-2">Final size to specify for procurement. Always round up to the nearest manufacturer size.</p>
              </div>
            </div>

            {/* Calculation Receipt */}
            <div className="bg-[#1a1d24] border border-slate-800 rounded-xl p-5">
              <button 
                onClick={() => setShowMath(!showMath)} 
                className="flex items-center justify-between w-full text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                <span className="flex items-center gap-2"><Calculator className="w-4 h-4 text-blue-400"/> Show Calculation Steps</span>
                {showMath ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
              </button>
              
              {showMath && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-3 font-mono text-xs text-slate-400 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between">
                    <span>1. Continuous Ah:</span>
                    <span>{results.cAmps.toFixed(1)}A × {results.dHrs}h = {(results.cAmps * results.dHrs).toFixed(1)} Ah</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2. Non-Continuous Ah:</span>
                    <span>{results.ncAmps.toFixed(1)}A × {results.dHrs}h = {(results.ncAmps * results.dHrs).toFixed(1)} Ah</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3. Momentary Ah:</span>
                    <span>{results.mAmps.toFixed(1)}A × (1/60)h = {(results.mAmps * (1/60)).toFixed(1)} Ah</span>
                  </div>
                  <div className="flex justify-between text-slate-300 border-t border-slate-800 pt-2 mt-2">
                    <span>Base Capacity:</span>
                    <span>{results.baseAh.toFixed(1)} Ah</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
                    <span>4. Apply Factors:</span>
                    <span>{results.baseAh.toFixed(1)} × {designMargin} × {agingFactor} × {tempFactor}</span>
                  </div>
                  <div className="flex justify-between text-blue-400 font-bold border-t border-slate-800 pt-2 mt-2 text-sm">
                    <span>Final Required Capacity:</span>
                    <span>{results.correctedAh.toFixed(1)} Ah</span>
                  </div>
                </div>
              )}
            </div>

            {/* Battery & Charger Configuration */}
            <div className="bg-[#15181e] border border-slate-800 rounded-xl p-5 shadow-xl">
              <h3 className="text-sm font-medium text-slate-200 mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-emerald-400" /> Battery & Charger Configuration
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Total Cells</div>
                  <div className="text-lg font-mono text-slate-200">{results.cells}</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">End Voltage</div>
                  <div className="text-lg font-mono text-slate-200">{results.endVoltage.toFixed(1)}V</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Float Voltage</div>
                  <div className="text-lg font-mono text-slate-200">{results.floatVoltage.toFixed(1)}V</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Equalize Volts</div>
                  <div className="text-lg font-mono text-slate-200">{results.equalizeVoltage.toFixed(1)}V</div>
                </div>
              </div>
              <div className="mt-4 text-[10px] text-amber-400/80 flex gap-2 bg-amber-500/10 p-2.5 rounded border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p><strong>Charger Warning:</strong> Ensure your connected equipment (relays, SCADA) can withstand the Equalize Voltage ({results.equalizeVoltage.toFixed(1)}V). If not, you may need a voltage dropping diode.</p>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-[#15181e] border border-slate-800 rounded-xl p-5 shadow-xl h-[300px] flex flex-col">
              <h3 className="text-sm font-medium text-slate-200 mb-4">Capacity Breakdown (Ah)</h3>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a303c" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1e222a', borderColor: '#334155', borderRadius: '8px', color: '#cbd5e1' }}
                      itemStyle={{ fontSize: '13px' }}
                      cursor={{ fill: '#2a303c', opacity: 0.4 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                    <Bar dataKey="Continuous" stackId="a" fill="#3b82f6" name="Continuous Load" />
                    <Bar dataKey="Non-Continuous" stackId="a" fill="#60a5fa" name="Non-Continuous" />
                    <Bar dataKey="Momentary" stackId="a" fill="#93c5fd" name="Momentary" />
                    <Bar dataKey="Margin" stackId="a" fill="#a855f7" name="Design Margin" />
                    <Bar dataKey="Aging" stackId="a" fill="#f59e0b" name="Aging Factor" />
                    <Bar dataKey="Temperature" stackId="a" fill="#10b981" name="Temp Factor" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Standards Reference */}
            <div className="bg-[#1a1d24] border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-400" /> Key US Standards
              </h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-3">
                  <span className="font-mono text-blue-400 shrink-0">IEEE 485</span>
                  <span>Recommended Practice for Sizing Lead-Acid Batteries for Stationary Applications.</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-blue-400 shrink-0">IEEE 1115</span>
                  <span>Equivalent standard for sizing Nickel-Cadmium (Ni-Cd) batteries.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

