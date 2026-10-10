import React, { useState, useRef, useEffect } from 'react';
import { AeroTelemetry, AircraftModelType, SimulationParams } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import {
  downloadTelemetryJSON,
  downloadTelemetryCSV,
  ExportDataPayload,
} from '../utils/telemetryExport';
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
  Flame,
  FileCode2,
  FileSpreadsheet
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentModel = AIRCRAFT_MODELS[modelType];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

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

  const exportPayload: ExportDataPayload = {
    telemetry,
    aoaDeg,
    modelType,
    params,
    suctionPercentage,
    compressionPercentage,
    downwashDeg,
  };

  const handleExportJSON = () => {
    downloadTelemetryJSON(exportPayload);
    setExportSuccessMsg('JSON Snapshot Saved');
    setShowExportMenu(false);
    setTimeout(() => {
      setExportSuccessMsg(null);
    }, 3500);
  };

  const handleExportCSV = () => {
    downloadTelemetryCSV(exportPayload);
    setExportSuccessMsg('CSV Dataset Saved');
    setShowExportMenu(false);
    setTimeout(() => {
      setExportSuccessMsg(null);
    }, 3500);
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* HUD Header Toolbar */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200 truncate">
            Telemetry &amp; Forces
          </span>
          {exportSuccessMsg && (
            <span className="ml-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[10px] font-mono flex items-center gap-1 shrink-0 animate-in fade-in duration-150">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{exportSuccessMsg}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowLiftDetails((prev) => !prev)}
            className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
            title="Toggle lift breakdown parameters"
          >
            <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
            <span>{showLiftDetails ? 'Less' : 'Lift Details'}</span>
            {showLiftDetails ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
          </button>

          {/* Dedicated Export Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowExportMenu((prev) => !prev)}
              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/40 cursor-pointer"
              title="Export flight telemetry and aerodynamic dataset"
              aria-expanded={showExportMenu}
              aria-haspopup="true"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
              <ChevronDown className={`w-3 h-3 text-cyan-200 transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-60 rounded-xl bg-[#090d19]/95 border border-slate-700/90 shadow-2xl backdrop-blur-xl p-1.5 z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-2 py-1 border-b border-slate-800/80">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Export Flight Data
                  </span>
                </div>

                <button
                  onClick={handleExportJSON}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/90 flex items-start gap-2.5 text-slate-200 group transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 shrink-0">
                    <FileCode2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      JSON Snapshot
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">.json</span>
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Full flight conditions, forces &amp; polar sweep envelope
                    </span>
                  </div>
                </button>

                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/90 flex items-start gap-2.5 text-slate-200 group transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      CSV Dataset
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">.csv</span>
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Spreadsheet table with metrics &amp; AoA sweep data
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6 Primary Telemetry Metric Cards */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2 perspective-1000">
        {/* 1. Lift Coefficient (CL) */}
        <div className="antigravity-card p-2.5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-sans text-cyan-200/80">Lift Coeff</span>
            <div className="w-5 h-5 rounded-md bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono tabular-nums drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]">
              {telemetry.cl.toFixed(2)}
            </span>
            <span className="text-[11px] font-mono text-cyan-400 font-bold">CL</span>
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Force:</span>
            <span className="font-mono text-cyan-300 font-semibold">{formatForce(telemetry.lift_N)}</span>
          </div>
        </div>

        {/* 2. Drag Coefficient (CD) */}
        <div className="antigravity-card p-2.5 rounded-xl flex flex-col justify-between hover:border-amber-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-sans text-amber-200/80">Drag Coeff</span>
            <div className="w-5 h-5 rounded-md bg-amber-950/70 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Wind className="w-3 h-3" />
            </div>
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono tabular-nums drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]">
              {telemetry.cd.toFixed(3)}
            </span>
            <span className="text-[11px] font-mono text-amber-400 font-bold">CD</span>
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Force:</span>
            <span className="font-mono text-amber-300 font-semibold">{formatForce(telemetry.drag_N)}</span>
          </div>
        </div>

        {/* 3. Aerodynamic Efficiency (L/D) */}
        <div className="antigravity-card p-2.5 rounded-xl flex flex-col justify-between hover:border-emerald-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-sans text-emerald-200/80">Efficiency</span>
            <div className="w-5 h-5 rounded-md bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Activity className="w-3 h-3" />
            </div>
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-400 font-mono tabular-nums drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]">
              {telemetry.ldRatio.toFixed(1)}
            </span>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">L/D</span>
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Glide:</span>
            <span className="font-mono text-emerald-300 font-semibold">{telemetry.ldRatio > 0 ? `${telemetry.ldRatio.toFixed(1)}:1` : '0:1'}</span>
          </div>
        </div>

        {/* 4. Speed & Mach Regime */}
        <div className="antigravity-card p-2.5 rounded-xl flex flex-col justify-between hover:border-indigo-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-sans text-indigo-200/80">Mach Regime</span>
            <div className="w-5 h-5 rounded-md bg-indigo-950/70 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Gauge className="w-3 h-3" />
            </div>
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className={`text-xl sm:text-2xl font-bold tracking-tight font-mono tabular-nums ${telemetry.mach >= 1.0 ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]' : 'text-white'}`}>
              M {telemetry.mach.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-slate-400">Speed:</span>
            <span className="font-mono text-cyan-300 font-semibold">{params.airspeed_kts} kts</span>
          </div>
        </div>

        {/* 5. Dynamic Pressure (q) */}
        <div className="antigravity-card p-2.5 rounded-xl flex flex-col justify-between hover:border-rose-500/50">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-sans text-rose-200/80">Dyn Pressure</span>
            <div className="w-5 h-5 rounded-md bg-rose-950/70 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Flame className="w-3 h-3" />
            </div>
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono tabular-nums drop-shadow-[0_0_12px_rgba(244,63,94,0.3)]">
              {(telemetry.dynamic_pressure_pa / 1000).toFixed(1)}
            </span>
            <span className="text-[11px] font-mono text-rose-400 font-bold">kPa</span>
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/5">
            <span>Altitude:</span>
            <span className="font-mono text-slate-300">{params.altitude_ft.toLocaleString()} ft</span>
          </div>
        </div>

        {/* 6. Flow State & Stall Margin */}
        <div className={`antigravity-card p-2.5 rounded-xl flex flex-col justify-between ${
          telemetry.isStalled
            ? '!border-red-500/80 !bg-red-950/40 shadow-[0_16px_40px_rgba(239,68,68,0.3)]'
            : telemetry.stallMargin < 4
            ? '!border-amber-500/60 !bg-amber-950/30'
            : ''
        }`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider font-sans text-slate-300">Flow State</span>
            {telemetry.isStalled ? (
              <ShieldAlert className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>
          <div className="my-1.5 flex items-baseline gap-1">
            <span className={`text-sm sm:text-base font-bold tracking-tight font-sans truncate ${
              telemetry.isStalled ? 'text-red-300' : 'text-slate-100'
            }`}>
              {telemetry.flowState}
            </span>
          </div>
          <div className="text-[10px] flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-slate-400">Stall Margin:</span>
            <span className={`font-mono font-semibold ${
              telemetry.stallMargin <= 0 ? 'text-red-400' : telemetry.stallMargin < 3 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {telemetry.stallMargin > 0 ? `+${telemetry.stallMargin.toFixed(1)}°` : `${telemetry.stallMargin.toFixed(1)}°`}
            </span>
          </div>
        </div>
      </div>

      {/* LIFT GENERATION MECHANICS BREAKDOWN PANEL */}
      {showLiftDetails && (
        <div className="antigravity-glass p-3.5 rounded-xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between gap-1 border-b border-cyan-500/20 pb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-cyan-950/70 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                <ArrowUp className="w-3 h-3" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
                Lift Distribution
              </span>
            </div>
            <div className="text-[11px] text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded border border-white/5 font-mono text-cyan-300">
              {formatForce(telemetry.lift_N)}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 perspective-1000">
            {/* 1. Pressure Distribution Split: Suction vs Compression */}
            <div className="antigravity-card p-3 rounded-lg flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-200">
                  Surface Pressure Source
                </span>
                <span className="text-[10px] text-slate-400">Upper / Lower</span>
              </div>

              {/* Stacked Percentage Bar */}
              <div className="flex flex-col gap-1.5">
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-900 border border-cyan-500/30 p-0.5 shadow-inner">
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

                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className={telemetry.isStalled ? 'text-red-400 font-semibold' : 'text-cyan-300 font-semibold'}>
                    Suction: {suctionPercentage.toFixed(1)}%
                  </span>
                  <span className="text-amber-400 font-semibold">
                    Compression: {compressionPercentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Downwash Momentum Deflection & Net Climb Vector */}
            <div className="grid grid-cols-2 gap-2">
              <div className="antigravity-card p-2.5 rounded-lg flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <ArrowDown className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] text-slate-300">Downwash (ε):</span>
                </div>
                <span className="font-mono text-cyan-300 font-bold text-sm mt-1">
                  {downwashDeg.toFixed(1)}°
                </span>
              </div>

              <div className="antigravity-card p-2.5 rounded-lg flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <ArrowUp className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-slate-300">Vertical Climb:</span>
                </div>
                <span className={`font-mono font-bold text-sm mt-1 ${
                  telemetry.lift_N > 0 && !telemetry.isStalled ? 'text-emerald-400' : 'text-amber-400'
                }`}>
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
