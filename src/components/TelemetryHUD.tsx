import React, { useState } from 'react';
import { AeroTelemetry, AircraftModelType, SimulationParams } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import { 
  Gauge, 
  Wind, 
  Activity, 
  ArrowUpRight, 
  ShieldAlert, 
  CheckCircle2, 
  Download, 
  ArrowDown, 
  ArrowUp,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Flame
} from 'lucide-react';

interface TelemetryHUDProps {
  telemetry: AeroTelemetry;
  aoaDeg: number;
  modelType: AircraftModelType;
  params: SimulationParams;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({
  telemetry,
  aoaDeg,
  modelType,
  params,
}) => {
  const [showLiftDetails, setShowLiftDetails] = useState(true);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const currentModel = AIRCRAFT_MODELS[modelType];

  const formatForce = (newtons: number) => {
    if (Math.abs(newtons) >= 1e6) return `${(newtons / 1e6).toFixed(2)} MN`;
    if (Math.abs(newtons) >= 1e3) return `${(newtons / 1e3).toFixed(1)} kN`;
    return `${newtons} N`;
  };

  // Lift Generation Physics Calculation
  const suctionPercentage = telemetry.isStalled
    ? Math.max(25, 45 - Math.max(0, aoaDeg - currentModel.stallAngle) * 2)
    : Math.min(88, 72 + Math.max(0, aoaDeg) * 0.5);
  const compressionPercentage = 100 - suctionPercentage;

  // Downwash angle epsilon = 2 * CL / (pi * AR) in radians
  const aspectRatio = Math.pow(currentModel.wingspan, 2) / (currentModel.wingspan * currentModel.chord);
  const downwashRad = (2 * Math.max(0, telemetry.cl)) / (Math.PI * Math.max(2, aspectRatio));
  const downwashDeg = (downwashRad * 180) / Math.PI;

  // CSV Export
  const handleExportCSV = () => {
    const timestamp = new Date().toISOString();
    const rows: [string, string, string, string][] = [
      ['Metric', 'Value', 'Unit', 'Description'],
      ['Timestamp', timestamp, 'ISO 8601', 'Simulation capture timestamp'],
      ['Model Identifier', currentModel.id, '-', 'Aircraft model identifier'],
      ['Model Full Name', currentModel.name, '-', 'Aircraft full name'],
      ['Wing Area (Reference)', (currentModel.wingspan * currentModel.chord).toFixed(2), 'm2', 'Reference aerodynamic planform area'],
      ['Wingspan', currentModel.wingspan.toString(), 'm', 'Wing tip to tip distance'],
      ['Mean Aerodynamic Chord', currentModel.chord.toString(), 'm', 'Average wing chord length'],
      ['Angle of Attack (alpha)', aoaDeg.toFixed(2), 'deg', 'Wing chord to relative wind angle'],
      ['Inflow Airspeed', params.airspeed_kts.toFixed(1), 'knots', 'Wind tunnel airspeed'],
      ['Airspeed (Metric)', (params.airspeed_kts * 0.514444).toFixed(2), 'm/s', 'True airspeed'],
      ['Mach Number', telemetry.mach.toFixed(3), 'M', 'Speed ratio relative to local speed of sound'],
      ['Test Altitude', params.altitude_ft.toString(), 'ft', 'Atmospheric test altitude'],
      ['Air Density (rho)', telemetry.air_density_kg_m3.toFixed(4), 'kg/m3', 'Atmospheric mass density'],
      ['Trailing Flaps', params.flaps_deg.toString(), 'deg', 'High-lift trailing edge flap deflection'],
      ['Lift Coefficient (CL)', telemetry.cl.toFixed(4), '-', 'Dimensionless lift coefficient'],
      ['Drag Coefficient (CD)', telemetry.cd.toFixed(4), '-', 'Dimensionless drag coefficient'],
      ['Aerodynamic Efficiency (L/D)', telemetry.ldRatio.toFixed(2), ':1', 'Lift-to-drag glide ratio'],
      ['Total Aerodynamic Lift', telemetry.lift_N.toString(), 'N', 'Vertical aerodynamic lift force'],
      ['Total Aerodynamic Drag', telemetry.drag_N.toString(), 'N', 'Horizontal aerodynamic drag force'],
      ['Dynamic Pressure (q)', telemetry.dynamic_pressure_pa.toString(), 'Pa', 'Kinetic energy per unit volume'],
      ['Reynolds Number (Re)', telemetry.reynolds.toString(), '-', 'Inertial to viscous force ratio'],
      ['Boundary Flow State', telemetry.flowState, '-', 'Laminar / Turbulent / Separation state'],
      ['Stall Status', telemetry.isStalled ? 'TRUE (STALLED)' : 'FALSE (ATTACHED)', '-', 'Critical AoA exceeded'],
      ['Stall Margin', telemetry.stallMargin.toFixed(2), 'deg', 'Margin before critical separation'],
      ['Upper Surface Suction Contribution', suctionPercentage.toFixed(1), '%', 'Bernoulli suction pressure contribution to lift'],
      ['Lower Surface Compression Contribution', compressionPercentage.toFixed(1), '%', 'Dynamic ram pressure contribution to lift'],
      ['Downwash Deflection Angle', downwashDeg.toFixed(2), 'deg', 'Downward momentum deflection of flow']
    ];

    const csvContent = rows.map((e) => e.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = `aerolab_telemetry_${currentModel.id}_aoa${aoaDeg >= 0 ? '+' : ''}${aoaDeg.toFixed(1)}deg.csv`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportSuccessMsg(`Exported ${fileName}`);
    setTimeout(() => {
      setExportSuccessMsg(null);
    }, 3800);
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* HUD Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Real-Time Flight Telemetry &amp; Lift Generation
          </span>
          {exportSuccessMsg && (
            <span className="ml-2 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-xs font-mono flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{exportSuccessMsg}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLiftDetails((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showLiftDetails ? 'Hide Lift Physics' : 'Show Lift Generation'}</span>
            {showLiftDetails ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/40"
            title="Export telemetry data as a CSV spreadsheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 6 Primary Telemetry Metric Cards (Antigravity Spatial Depth & Glassmorphism) */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 perspective-1000">
        {/* 1. Lift Coefficient (CL) */}
        <div className="antigravity-card p-3.5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-sans text-cyan-200/80">Lift Coeff</span>
            <div className="w-6 h-6 rounded-lg bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono tabular-nums drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]">
              {telemetry.cl.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-cyan-400 font-bold">CL</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Force:</span>
            <span className="font-mono text-cyan-300 font-semibold">{formatForce(telemetry.lift_N)}</span>
          </div>
        </div>

        {/* 2. Drag Coefficient (CD) */}
        <div className="antigravity-card p-3.5 rounded-2xl flex flex-col justify-between hover:border-amber-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-sans text-amber-200/80">Drag Coeff</span>
            <div className="w-6 h-6 rounded-lg bg-amber-950/70 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Wind className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono tabular-nums drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]">
              {telemetry.cd.toFixed(3)}
            </span>
            <span className="text-xs font-mono text-amber-400 font-bold">CD</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Force:</span>
            <span className="font-mono text-amber-300 font-semibold">{formatForce(telemetry.drag_N)}</span>
          </div>
        </div>

        {/* 3. Aerodynamic Efficiency (L/D) */}
        <div className="antigravity-card p-3.5 rounded-2xl flex flex-col justify-between hover:border-emerald-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-sans text-emerald-200/80">Efficiency</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-400 font-mono tabular-nums drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]">
              {telemetry.ldRatio.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-emerald-400 font-bold">L/D</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Glide:</span>
            <span className="font-mono text-emerald-300 font-semibold">{telemetry.ldRatio > 0 ? `${telemetry.ldRatio.toFixed(1)}:1` : '0:1'}</span>
          </div>
        </div>

        {/* 4. Speed & Mach Regime */}
        <div className="antigravity-card p-3.5 rounded-2xl flex flex-col justify-between hover:border-indigo-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-sans text-indigo-200/80">Mach Regime</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-950/70 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Gauge className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className={`text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums ${telemetry.mach >= 1.0 ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'text-white'}`}>
              M {telemetry.mach.toFixed(2)}
            </span>
          </div>
          <div className="text-[11px] flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-slate-400">Speed:</span>
            <span className="font-mono text-cyan-300 font-semibold">{params.airspeed_kts} kts</span>
          </div>
        </div>

        {/* 5. Dynamic Pressure (q) */}
        <div className="antigravity-card p-3.5 rounded-2xl flex flex-col justify-between hover:border-rose-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-sans text-rose-200/80">Dyn Pressure</span>
            <div className="w-6 h-6 rounded-lg bg-rose-950/70 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Flame className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono tabular-nums drop-shadow-[0_0_12px_rgba(244,63,94,0.3)]">
              {(telemetry.dynamic_pressure_pa / 1000).toFixed(1)}
            </span>
            <span className="text-xs font-mono text-rose-400 font-bold">kPa</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Altitude:</span>
            <span className="font-mono text-slate-300">{params.altitude_ft.toLocaleString()} ft</span>
          </div>
        </div>

        {/* 6. Flow State & Stall Margin */}
        <div className={`antigravity-card p-3.5 rounded-2xl flex flex-col justify-between ${
          telemetry.isStalled
            ? '!border-red-500/80 !bg-red-950/40 shadow-[0_16px_40px_rgba(239,68,68,0.3)]'
            : telemetry.stallMargin < 4
            ? '!border-amber-500/60 !bg-amber-950/30'
            : ''
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider font-sans text-slate-300">Flow State</span>
            {telemetry.isStalled ? (
              <ShieldAlert className="w-4 h-4 text-red-400 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className={`text-base sm:text-lg font-bold tracking-tight font-sans truncate ${
              telemetry.isStalled ? 'text-red-300' : 'text-slate-100'
            }`}>
              {telemetry.flowState}
            </span>
          </div>
          <div className="text-[11px] flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-slate-400">Stall Margin:</span>
            <span className={`font-mono font-semibold ${
              telemetry.stallMargin <= 0 ? 'text-red-400' : telemetry.stallMargin < 3 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {telemetry.stallMargin > 0 ? `+${telemetry.stallMargin.toFixed(1)}°` : `${telemetry.stallMargin.toFixed(1)}°`}
            </span>
          </div>
        </div>
      </div>

      {/* LIFT GENERATION MECHANICS BREAKDOWN PANEL (Antigravity Glassmorphism) */}
      {showLiftDetails && (
        <div className="antigravity-glass p-5 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-cyan-950/70 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                <ArrowUp className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
                Aerodynamic Lift Generation Breakdown (Bernoulli Suction vs Newtonian Downwash)
              </span>
            </div>
            <div className="text-xs text-slate-300 bg-slate-900/60 px-3 py-1 rounded-lg border border-white/5">
              Total Lift: <span className="font-mono text-cyan-300 font-bold">{formatForce(telemetry.lift_N)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 perspective-1000">
            {/* 1. Pressure Distribution Split: Suction vs Compression */}
            <div className="antigravity-card p-4 rounded-xl flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-cyan-200 block mb-1">
                  1. Surface Pressure Source Distribution
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Net upward force created by low-pressure suction on the upper camber crest versus dynamic ram compression beneath.
                </p>
              </div>

              {/* Stacked Percentage Bar */}
              <div className="flex flex-col gap-2">
                <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-900 border border-cyan-500/30 p-0.5 shadow-inner">
                  <div 
                    style={{ width: `${suctionPercentage}%` }} 
                    className={`h-full rounded-full transition-all duration-300 ${telemetry.isStalled ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-500 to-sky-400'}`}
                    title={`Upper Surface Suction: ${suctionPercentage.toFixed(1)}%`}
                  />
                  <div 
                    style={{ width: `${compressionPercentage}%` }} 
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300 ml-0.5"
                    title={`Lower Surface Compression: ${compressionPercentage.toFixed(1)}%`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={telemetry.isStalled ? 'text-red-400 font-semibold' : 'text-cyan-300 font-semibold'}>
                    Suction: {suctionPercentage.toFixed(1)}%
                  </span>
                  <span className="text-amber-400 font-semibold">
                    Compression: {compressionPercentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Downwash Momentum Deflection (Newton's 3rd Law) */}
            <div className="antigravity-card p-4 rounded-xl flex flex-col justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-cyan-200 block mb-1">
                  2. Downwash Momentum Deflection
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  As the wing planform deflects incoming airflow downward (action), the equal reaction accelerates the craft vertically.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <ArrowDown className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-300">Downwash Angle (ε):</span>
                </div>
                <span className="font-mono text-cyan-300 font-bold text-sm drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">
                  {downwashDeg.toFixed(1)}°
                </span>
              </div>
            </div>

            {/* 3. Net Aerodynamic Vector & Stall Status */}
            <div className={`antigravity-card p-4 rounded-xl flex flex-col justify-between gap-3 ${
              telemetry.isStalled ? '!border-red-500/80 !bg-red-950/30' : ''
            }`}>
              <div>
                <span className="text-xs font-bold text-cyan-200 block mb-1">
                  3. Net Vertical Force State
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {telemetry.isStalled
                    ? 'Flow has separated from the upper surface. Suction peak collapsed and severe wake turbulence induced high drag.'
                    : 'Kutta circulation is established. Upper boundary layer is cleanly attached, imparting continuous downward momentum.'}
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20">
                <span className="text-xs text-slate-300">Net Climb Vector:</span>
                <span className={`font-mono font-bold text-sm flex items-center gap-1.5 ${
                  telemetry.lift_N > 0 && !telemetry.isStalled ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-amber-400'
                }`}>
                  {telemetry.lift_N > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                  {formatForce(telemetry.lift_N)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
