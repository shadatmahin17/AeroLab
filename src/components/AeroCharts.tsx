import React, { useState, useRef, useEffect } from 'react';
import { AircraftModelType, AeroTelemetry } from '../types/aerodynamics';
import { calculateAeroTelemetry, AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import {
  downloadSvgElement,
  downloadSvgAsPng,
  downloadCurveDataCSV,
} from '../utils/telemetryExport';
import { 
  TrendingUp, 
  Download, 
  ChevronDown, 
  Image, 
  FileCode2, 
  FileSpreadsheet, 
  CheckCircle2 
} from 'lucide-react';

interface AeroChartsProps {
  modelType: AircraftModelType;
  currentAoa: number;
  airspeedKts: number;
  altitudeFt: number;
  flapsDeg: number;
  telemetry: AeroTelemetry;
}

export const AeroCharts: React.FC<AeroChartsProps> = ({
  modelType,
  currentAoa,
  airspeedKts,
  altitudeFt,
  flapsDeg,
  telemetry,
}) => {
  const [activeTab, setActiveTab] = useState<'lift' | 'dragPolar' | 'pressure'>('lift');
  const [showChartExportMenu, setShowChartExportMenu] = useState(false);
  const [chartSuccessMsg, setChartSuccessMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const chartMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chartMenuRef.current && !chartMenuRef.current.contains(event.target as Node)) {
        setShowChartExportMenu(false);
      }
    };
    if (showChartExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChartExportMenu]);

  // Generate data points for polar curves
  const aoaRange: { aoa: number; cl: number; cd: number; isStalled: boolean }[] = [];
  for (let a = -15; a <= 30; a += 1.5) {
    const pt = calculateAeroTelemetry(modelType, a, airspeedKts, altitudeFt, flapsDeg);
    aoaRange.push({ aoa: a, cl: pt.cl, cd: pt.cd, isStalled: pt.isStalled });
  }

  // Dimensions for SVG plotting
  const width = 440;
  const height = 190;
  const pad = { left: 45, right: 20, top: 20, bottom: 35 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Render Lift Curve (CL vs AoA) in Vibrant Cyan
  const renderLiftCurve = () => {
    const minAoa = -15;
    const maxAoa = 30;
    const minCl = -1.2;
    const maxCl = 2.6;

    const scaleX = (aoa: number) => pad.left + ((aoa - minAoa) / (maxAoa - minAoa)) * plotW;
    const scaleY = (cl: number) => pad.top + plotH - ((cl - minCl) / (maxCl - minCl)) * plotH;

    // Line path
    const pathD = aoaRange.reduce((acc, pt, idx) => {
      const x = scaleX(pt.aoa);
      const y = scaleY(pt.cl);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');

    // Current operating point
    const currX = scaleX(currentAoa);
    const currY = scaleY(telemetry.cl);
    const zeroLiftY = scaleY(0);
    const zeroAoaX = scaleX(0);

    return (
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {/* Zero axes */}
        <line x1={pad.left} y1={zeroLiftY} x2={width - pad.right} y2={zeroLiftY} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={zeroAoaX} y1={pad.top} x2={zeroAoaX} y2={height - pad.bottom} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />

        {/* Ticks */}
        {[-10, 0, 10, 20].map((deg) => (
          <g key={deg} transform={`translate(${scaleX(deg)}, ${height - pad.bottom + 14})`}>
            <text fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
              {deg}°
            </text>
          </g>
        ))}

        {[-0.5, 0, 1.0, 2.0].map((c) => (
          <g key={c} transform={`translate(${pad.left - 8}, ${scaleY(c) + 3})`}>
            <text fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
              {c.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Stall boundary band */}
        {AIRCRAFT_MODELS[modelType].stallAngle && (
          <rect
            x={scaleX(AIRCRAFT_MODELS[modelType].stallAngle)}
            y={pad.top}
            width={width - pad.right - scaleX(AIRCRAFT_MODELS[modelType].stallAngle)}
            height={plotH}
            fill="rgba(239, 68, 68, 0.12)"
          />
        )}

        {/* Polar line (Vibrant Electric Cyan) */}
        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

        {/* Current point */}
        <circle cx={currX} cy={currY} r="7" fill={telemetry.isStalled ? '#ef4444' : '#38bdf8'} className="animate-pulse" />
        <circle cx={currX} cy={currY} r="3" fill="#ffffff" />

        {/* Operating Point callout label */}
        <text
          x={currX > width - 100 ? currX - 10 : currX + 10}
          y={currY < 50 ? currY + 16 : currY - 10}
          fill={telemetry.isStalled ? '#f87171' : '#bae6fd'}
          fontSize="11"
          fontWeight="600"
          fontFamily="monospace"
          textAnchor={currX > width - 100 ? 'end' : 'start'}
        >
          {`α: ${currentAoa >= 0 ? '+' : ''}${currentAoa.toFixed(1)}°, CL: ${telemetry.cl.toFixed(2)}`}
        </text>

        {/* Axis labels */}
        <text x={width - pad.right} y={height - 10} fill="#94a3b8" fontSize="10" textAnchor="end" fontFamily="sans-serif">
          Angle of Attack (α) →
        </text>
        <text x={pad.left} y={14} fill="#94a3b8" fontSize="10" textAnchor="start" fontFamily="sans-serif">
          ↑ Lift Coefficient (CL)
        </text>
      </svg>
    );
  };

  // Render Drag Polar (CL vs CD) in Golden Amber
  const renderDragPolar = () => {
    const minCd = 0.0;
    const maxCd = 0.65;
    const minCl = -0.5;
    const maxCl = 2.4;

    const scaleX = (cd: number) => pad.left + ((cd - minCd) / (maxCd - minCd)) * plotW;
    const scaleY = (cl: number) => pad.top + plotH - ((cl - minCl) / (maxCl - minCl)) * plotH;

    const pathD = aoaRange.reduce((acc, pt, idx) => {
      const x = scaleX(Math.min(maxCd, pt.cd));
      const y = scaleY(pt.cl);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');

    const currX = scaleX(Math.min(maxCd, telemetry.cd));
    const currY = scaleY(telemetry.cl);

    return (
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {/* Grids */}
        <line x1={pad.left} y1={scaleY(0)} x2={width - pad.right} y2={scaleY(0)} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />

        {/* Ticks */}
        {[0.0, 0.2, 0.4, 0.6].map((cd) => (
          <g key={cd} transform={`translate(${scaleX(cd)}, ${height - pad.bottom + 14})`}>
            <text fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
              {cd.toFixed(1)}
            </text>
          </g>
        ))}

        {[0.0, 1.0, 2.0].map((c) => (
          <g key={c} transform={`translate(${pad.left - 8}, ${scaleY(c) + 3})`}>
            <text fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
              {c.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Maximum efficiency tangent from origin */}
        <line x1={scaleX(0)} y1={scaleY(0)} x2={scaleX(0.18)} y2={scaleY(2.2)} stroke="rgba(52, 211, 153, 0.4)" strokeWidth="1.5" strokeDasharray="4 3" />

        {/* Curve (Golden Amber) */}
        <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />

        {/* Operating Point */}
        <circle cx={currX} cy={currY} r="7" fill={telemetry.isStalled ? '#ef4444' : '#f59e0b'} className="animate-pulse" />
        <circle cx={currX} cy={currY} r="3" fill="#ffffff" />

        <text
          x={currX + 10}
          y={currY - 8}
          fill="#fde68a"
          fontSize="11"
          fontWeight="600"
          fontFamily="monospace"
        >
          {`CD: ${telemetry.cd.toFixed(3)}, CL: ${telemetry.cl.toFixed(2)}`}
        </text>

        {/* Axis labels */}
        <text x={width - pad.right} y={height - 10} fill="#94a3b8" fontSize="10" textAnchor="end" fontFamily="sans-serif">
          Drag Coefficient (CD) →
        </text>
        <text x={pad.left} y={14} fill="#94a3b8" fontSize="10" textAnchor="start" fontFamily="sans-serif">
          ↑ Lift (CL)
        </text>
      </svg>
    );
  };

  // Render Pressure Distribution Cp vs x/c in Dual Colors
  const renderPressureCurve = () => {
    const pointsUpper: [number, number][] = [];
    const pointsLower: [number, number][] = [];

    const effectiveCl = Math.max(0.1, telemetry.cl);
    for (let i = 0; i <= 30; i++) {
      const xc = i / 30;
      const cpUpper = -effectiveCl * 1.8 * (Math.pow(1 - xc, 0.45) / Math.sqrt(Math.max(0.04, xc))) + 0.15;
      const cpLower = effectiveCl * 0.7 * Math.pow(1 - xc, 0.75);

      pointsUpper.push([xc, Math.max(-3.5, Math.min(1.0, cpUpper))]);
      pointsLower.push([xc, Math.max(-0.5, Math.min(1.0, cpLower))]);
    }

    const minCp = -3.5;
    const maxCp = 1.2;

    const scaleX = (xc: number) => pad.left + xc * plotW;
    const scaleY = (cp: number) => pad.top + ((cp - minCp) / (maxCp - minCp)) * plotH;

    const pathUpper = pointsUpper.reduce((acc, [xc, cp], idx) => {
      const x = scaleX(xc);
      const y = scaleY(cp);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');

    const pathLower = pointsLower.reduce((acc, [xc, cp], idx) => {
      const x = scaleX(xc);
      const y = scaleY(cp);
      return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');

    return (
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {/* Zero Cp axis */}
        <line x1={pad.left} y1={scaleY(0)} x2={width - pad.right} y2={scaleY(0)} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />

        {/* Ticks */}
        {[0.0, 0.25, 0.5, 0.75, 1.0].map((xc) => (
          <g key={xc} transform={`translate(${scaleX(xc)}, ${height - pad.bottom + 14})`}>
            <text fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
              {xc.toFixed(2)}
            </text>
          </g>
        ))}

        {[-3.0, -1.5, 0.0, 1.0].map((cp) => (
          <g key={cp} transform={`translate(${pad.left - 8}, ${scaleY(cp) + 3})`}>
            <text fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
              {cp > 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Curves: Upper surface is suction (blue), Lower surface is compression (amber) */}
        <path d={pathUpper} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
        <path d={pathLower} fill="none" stroke="#f59e0b" strokeWidth="2.5" />

        <text x={scaleX(0.15)} y={scaleY(-2.2)} fill="#38bdf8" fontSize="10" fontWeight="600" fontFamily="sans-serif">
          Upper Suction (-Cp)
        </text>
        <text x={scaleX(0.4)} y={scaleY(0.7)} fill="#f59e0b" fontSize="10" fontWeight="600" fontFamily="sans-serif">
          Lower Compression (+Cp)
        </text>

        {/* Axis labels */}
        <text x={width - pad.right} y={height - 10} fill="#94a3b8" fontSize="10" textAnchor="end" fontFamily="sans-serif">
          Chord Position (x / c) →
        </text>
        <text x={pad.left} y={14} fill="#94a3b8" fontSize="10" textAnchor="start" fontFamily="sans-serif">
          ↑ Suction (-Cp) / Pressure (+Cp)
        </text>
      </svg>
    );
  };

  const getBaseName = () => {
    const tabSuffix = activeTab === 'lift' ? 'lift_curve_cl_alpha' : activeTab === 'dragPolar' ? 'drag_polar_cl_cd' : 'pressure_dist_cp';
    return `aerolab_${modelType}_${tabSuffix}_aoa${currentAoa >= 0 ? '+' : ''}${currentAoa.toFixed(1)}deg`;
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    downloadSvgElement(svgRef.current, getBaseName());
    setChartSuccessMsg('SVG Saved');
    setShowChartExportMenu(false);
    setTimeout(() => setChartSuccessMsg(null), 3000);
  };

  const handleExportPng = async () => {
    if (!svgRef.current) return;
    try {
      await downloadSvgAsPng(svgRef.current, getBaseName(), 2);
      setChartSuccessMsg('PNG Saved');
    } catch (e) {
      console.error(e);
      setChartSuccessMsg('Export Error');
    }
    setShowChartExportMenu(false);
    setTimeout(() => setChartSuccessMsg(null), 3000);
  };

  const handleExportCurveCsv = () => {
    const baseName = getBaseName();
    if (activeTab === 'lift') {
      const points = aoaRange.map((pt) => ({
        x: pt.aoa,
        y: pt.cl,
        label: pt.isStalled ? 'Stalled' : 'Attached',
      }));
      downloadCurveDataCSV(points, 'Angle of Attack (deg)', 'Lift Coefficient (CL)', baseName);
    } else if (activeTab === 'dragPolar') {
      const points = aoaRange.map((pt) => ({
        x: pt.cd,
        y: pt.cl,
        label: `AoA=${pt.aoa.toFixed(1)}deg`,
      }));
      downloadCurveDataCSV(points, 'Drag Coefficient (CD)', 'Lift Coefficient (CL)', baseName);
    } else {
      // Pressure distribution
      const points: Array<{ x: number; y: number; label: string }> = [];
      const effectiveCl = Math.max(0.1, telemetry.cl);
      for (let i = 0; i <= 30; i++) {
        const xc = i / 30;
        const cpUpper = -effectiveCl * 1.8 * (Math.pow(1 - xc, 0.45) / Math.sqrt(Math.max(0.04, xc))) + 0.15;
        const cpLower = effectiveCl * 0.7 * Math.pow(1 - xc, 0.75);
        points.push({ x: xc, y: Math.max(-3.5, Math.min(1.0, cpUpper)), label: 'Upper Suction (-Cp)' });
        points.push({ x: xc, y: Math.max(-0.5, Math.min(1.0, cpLower)), label: 'Lower Compression (+Cp)' });
      }
      downloadCurveDataCSV(points, 'Chord Position (x/c)', 'Pressure Coefficient (Cp)', baseName);
    }
    setChartSuccessMsg('Data Saved');
    setShowChartExportMenu(false);
    setTimeout(() => setChartSuccessMsg(null), 3000);
  };

  return (
    <div className="w-full p-3.5 rounded-xl antigravity-glass flex flex-col gap-2.5">
      {/* Chart Header & Tabs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-md bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
              <TrendingUp className="w-3 h-3" />
            </div>
            <span className="text-xs font-bold text-slate-100 tracking-wide uppercase font-sans truncate">
              Aerodynamic Polars
            </span>
            {chartSuccessMsg && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-[9px] font-mono flex items-center gap-1 shrink-0 animate-in fade-in duration-150">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                <span>{chartSuccessMsg}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-cyan-300 font-mono hidden sm:inline">
              α: {currentAoa >= 0 ? '+' : ''}{currentAoa.toFixed(1)}°
            </span>

            {/* Export Chart Dropdown Menu */}
            <div className="relative" ref={chartMenuRef}>
              <button
                onClick={() => setShowChartExportMenu((prev) => !prev)}
                className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-[10px] font-semibold text-slate-200 flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
                title="Export graph as high-res PNG, vector SVG, or raw CSV points"
                aria-expanded={showChartExportMenu}
                aria-haspopup="true"
              >
                <Download className="w-2.5 h-2.5 text-cyan-400" />
                <span>Export Graph</span>
                <ChevronDown className={`w-2.5 h-2.5 text-slate-400 transition-transform duration-200 ${showChartExportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showChartExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-xl bg-[#090d19]/95 border border-slate-700/90 shadow-2xl backdrop-blur-xl p-1.5 z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-2 py-1 border-b border-slate-800/80">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                      Export Active Graph
                    </span>
                  </div>

                  <button
                    onClick={handleExportPng}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/90 flex items-center gap-2 text-slate-200 group transition-colors cursor-pointer"
                  >
                    <Image className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-slate-100 flex items-center gap-1">
                        High-Res Image
                        <span className="text-[9px] font-mono px-1 rounded bg-sky-500/20 text-sky-300">.png</span>
                      </span>
                      <span className="text-[9px] text-slate-400">Crisp 2× raster render</span>
                    </div>
                  </button>

                  <button
                    onClick={handleExportSvg}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/90 flex items-center gap-2 text-slate-200 group transition-colors cursor-pointer"
                  >
                    <FileCode2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-slate-100 flex items-center gap-1">
                        Vector Graphic
                        <span className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-300">.svg</span>
                      </span>
                      <span className="text-[9px] text-slate-400">Lossless scalable vector</span>
                    </div>
                  </button>

                  <button
                    onClick={handleExportCurveCsv}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/90 flex items-center gap-2 text-slate-200 group transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-slate-100 flex items-center gap-1">
                        Curve Points
                        <span className="text-[9px] font-mono px-1 rounded bg-emerald-500/20 text-emerald-300">.csv</span>
                      </span>
                      <span className="text-[9px] text-slate-400">Raw (x, y) plot coordinates</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Functional Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-950/80 border border-cyan-500/30">
          <button
            onClick={() => setActiveTab('lift')}
            className={`py-1 text-[11px] font-semibold rounded-md text-center transition-all cursor-pointer ${
              activeTab === 'lift'
                ? 'bg-gradient-to-r from-cyan-500 to-sky-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lift (CL-α)
          </button>
          <button
            onClick={() => setActiveTab('dragPolar')}
            className={`py-1 text-[11px] font-semibold rounded-md text-center transition-all cursor-pointer ${
              activeTab === 'dragPolar'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Drag (CL-CD)
          </button>
          <button
            onClick={() => setActiveTab('pressure')}
            className={`py-1 text-[11px] font-semibold rounded-md text-center transition-all cursor-pointer ${
              activeTab === 'pressure'
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cp Dist
          </button>
        </div>
      </div>

      {/* Graph Area */}
      <div className="w-full h-[185px] bg-slate-950/80 rounded-xl border border-cyan-500/20 p-1 flex items-center justify-center shadow-inner">
        {activeTab === 'lift' && renderLiftCurve()}
        {activeTab === 'dragPolar' && renderDragPolar()}
        {activeTab === 'pressure' && renderPressureCurve()}
      </div>
    </div>
  );
};
