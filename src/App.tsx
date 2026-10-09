import { useState, useMemo, useEffect } from 'react';
import { SimulationParams } from './types/aerodynamics';
import { calculateAeroTelemetry } from './utils/airfoilGenerators';
import { WindTunnelCanvas3D } from './components/WindTunnelCanvas3D';
import { WindTunnelCanvasWebGL } from './components/WindTunnelCanvasWebGL';
import { WindTunnelCanvas } from './components/WindTunnelCanvas';
import { TelemetryHUD } from './components/TelemetryHUD';
import { AeroCharts } from './components/AeroCharts';
import { ControlsDeck } from './components/ControlsDeck';
import { AeroTheoryModal } from './components/AeroTheoryModal';
import { ModelViewerModal } from './components/ModelViewerModal';
import { Plane, BookOpen, RotateCcw, Wind, Box, Grid, Keyboard } from 'lucide-react';

const INITIAL_PARAMS: SimulationParams = {
  modelType: 'f22',
  angle_of_attack: 4.0,
  airspeed_kts: 350,
  altitude_ft: 15000,
  flaps_deg: 0,
  viscosity: 0.10,
  smoke_density: 1.0,
  show_streamlines: true,
  show_particles: true,
  show_heatmap: false,
  show_pressure_vectors: true,
  show_quiver: false,
  show_shockwaves: true,
  audio_enabled: false,
  renderEngine: 'webgl',
  landingGear: false,
  renderShading: 'pbr',
};

export default function App() {
  const [params, setParams] = useState<SimulationParams>(INITIAL_PARAMS);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isTheoryOpen, setIsTheoryOpen] = useState<boolean>(false);
  const [isModelViewerOpen, setIsModelViewerOpen] = useState<boolean>(false);
  const [dimensionMode, setDimensionMode] = useState<'3d' | '2d'>('3d');

  // Parameter update handler
  const handleParamChange = <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  // Reset to defaults
  const handleReset = () => {
    setParams(INITIAL_PARAMS);
    setIsPaused(false);
  };

  // Keyboard Navigation & Simulator Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, or select
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setParams((p) => ({ ...p, angle_of_attack: Math.min(30, +(p.angle_of_attack + 0.5).toFixed(1)) }));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setParams((p) => ({ ...p, angle_of_attack: Math.max(-15, +(p.angle_of_attack - 0.5).toFixed(1)) }));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setParams((p) => ({ ...p, airspeed_kts: Math.min(1200, p.airspeed_kts + 15) }));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setParams((p) => ({ ...p, airspeed_kts: Math.max(20, p.airspeed_kts - 15) }));
      } else if (e.key === 'r' || e.key === 'R') {
        handleReset();
      } else if (e.key === 'm' || e.key === 'M') {
        setParams((p) => ({ ...p, audio_enabled: !p.audio_enabled }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Live Aerodynamic Physics Telemetry
  const telemetry = useMemo(() => {
    return calculateAeroTelemetry(
      params.modelType,
      params.angle_of_attack,
      params.airspeed_kts,
      params.altitude_ft,
      params.flaps_deg
    );
  }, [
    params.modelType,
    params.angle_of_attack,
    params.airspeed_kts,
    params.altitude_ft,
    params.flaps_deg,
  ]);

  return (
    <div className="min-h-screen bg-[#060913] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.12),rgba(3,6,13,0.95))] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. TOP BAR (Antigravity Floating Glass Capsule) */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-3 sticky top-2 z-50">
        <header className="h-16 px-4 sm:px-6 antigravity-glass rounded-2xl flex items-center justify-between shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)]">
          {/* Zone 1: Single text element wordmark with vibrant cyan emblem */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-950 to-slate-900 border border-cyan-500/60 flex items-center justify-center text-cyan-400 shadow-[0_0_16px_rgba(56,189,248,0.35)]">
              <Plane className="w-4 h-4" />
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-white font-sans flex items-center gap-1.5">
                AeroLab <span className="text-cyan-400 font-mono text-sm px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30">SPATIAL</span>
              </span>
            </div>
          </div>

          {/* Zone 2: Clean 4-6 text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#wind-tunnel" className="hover:text-cyan-400 transition-colors">
              Wind Tunnel
            </a>
            <a href="#telemetry" className="hover:text-cyan-400 transition-colors">
              Telemetry
            </a>
            <a href="#polar-curves" className="hover:text-cyan-400 transition-colors">
              Aerodynamic Polars
            </a>
            <a href="#controls" className="hover:text-cyan-400 transition-colors">
              Controls
            </a>
          </nav>

          {/* Zone 3: 1-2 primary actions */}
          <div className="flex items-center gap-2.5">
            {/* Dimension Mode Switcher (Antigravity Weightless Pill) */}
            <div className="flex items-center p-1 rounded-xl bg-slate-950/80 border border-cyan-500/30 shadow-inner">
              <button
                onClick={() => setDimensionMode('3d')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  dimensionMode === '3d'
                    ? 'bg-gradient-to-r from-cyan-500 to-sky-400 text-slate-950 font-bold shadow-[0_0_14px_rgba(56,189,248,0.5)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>3D CAD</span>
              </button>
              <button
                onClick={() => setDimensionMode('2d')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  dimensionMode === '2d'
                    ? 'bg-gradient-to-r from-cyan-500 to-sky-400 text-slate-950 font-bold shadow-[0_0_14px_rgba(56,189,248,0.5)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>2D Solver</span>
              </button>
            </div>

            {/* 3D CAD Asset Inspector Trigger */}
            <button
              onClick={() => setIsModelViewerOpen(true)}
              className="hidden sm:flex px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-400/40 hover:border-cyan-400 text-xs font-semibold text-cyan-200 hover:text-white transition-all items-center gap-1.5 shadow-sm hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]"
              title="Inspect 3D GLB CAD Model with Full Turntable & Specifications"
            >
              <Box className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>F-22 3D CAD</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                GLB
              </span>
            </button>

            <button
              onClick={() => setIsTheoryOpen(true)}
              className="hidden sm:flex px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 hover:border-cyan-500/60 text-xs font-semibold text-slate-200 hover:text-white transition-all items-center gap-1.5 whitespace-nowrap shadow-sm hover:shadow-[0_0_15px_rgba(56,189,248,0.25)]"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Theory Guide</span>
            </button>

            <button
              onClick={handleReset}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors border border-white/5"
              title="Reset Simulation to Initial State"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </header>
      </div>

      {/* 2. MAIN APPLICATION CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Intro Subtitle / Unboxed Metadata */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-200 font-semibold">3D Aerospace Wind Tunnel</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Three.js WebGL &amp; Blender CAD Engine</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-cyan-400 font-medium">Dynamic CFD Multiphysics Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Airfoil Profiles &amp; Transonic Fighters</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono text-cyan-300 font-semibold">Mach 0.08 - 2.2</span>
          </div>
        </div>

        {/* SECTION A: Wind Tunnel Stage (3D Real Model or 2D Solver) */}
        <section id="wind-tunnel" className="flex flex-col gap-2">
          {dimensionMode === '2d' ? (
            <WindTunnelCanvas
              params={params}
              onParamChange={handleParamChange}
              telemetry={telemetry}
              isPaused={isPaused}
            />
          ) : params.renderEngine !== 'canvas' && params.modelType === 'f22' ? (
            <WindTunnelCanvasWebGL
              params={params}
              onParamChange={handleParamChange}
              telemetry={telemetry}
              isPaused={isPaused}
              onFallbackToCanvas={() => handleParamChange('renderEngine', 'canvas')}
              onOpenModelInspector={() => setIsModelViewerOpen(true)}
            />
          ) : (
            <WindTunnelCanvas3D
              params={params}
              onParamChange={handleParamChange}
              telemetry={telemetry}
              isPaused={isPaused}
              onFallbackTo2D={() => setDimensionMode('2d')}
              onOpenWebGL={params.modelType === 'f22' ? () => handleParamChange('renderEngine', 'webgl') : undefined}
              onOpenModelInspector={params.modelType === 'f22' ? () => setIsModelViewerOpen(true) : undefined}
            />
          )}
        </section>

        {/* SECTION B: Live Telemetry Flight Instruments */}
        <section id="telemetry" className="flex flex-col gap-2">
          <TelemetryHUD
            telemetry={telemetry}
            aoaDeg={params.angle_of_attack}
            modelType={params.modelType}
            params={params}
          />
        </section>

        {/* SECTION C: Side-by-Side Aerodynamic Polars & Flight Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Aerodynamic Polar Curves */}
          <section id="polar-curves" className="lg:col-span-5 flex flex-col gap-4">
            <AeroCharts
              modelType={params.modelType}
              currentAoa={params.angle_of_attack}
              airspeedKts={params.airspeed_kts}
              altitudeFt={params.altitude_ft}
              flapsDeg={params.flaps_deg}
              telemetry={telemetry}
            />

            {/* Quick Physics Insight Card (Antigravity Floating Glass) */}
            <div className="antigravity-glass-subtle p-4 rounded-2xl text-xs text-slate-400 flex flex-col gap-2.5 leading-relaxed">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <div className="w-6 h-6 rounded-lg bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Wind className="w-3.5 h-3.5" />
                </div>
                <span className="text-cyan-200 font-bold">Real-Time Flow Dynamics Insight</span>
              </div>
              <p>
                In the wind tunnel chamber, flow streamlines deflect around the aircraft profile. Notice the aerodynamic downwash angle dipping behind the trailing edge, confirming active Kutta circulation.
                {telemetry.isStalled ? (
                  <span className="text-red-400 font-medium block mt-1.5 p-2 rounded-lg bg-red-950/40 border border-red-500/40">
                    ⚠️ Current high Angle of Attack exceeds the critical stall limit! Adverse pressure gradients have decoupled the boundary layer, producing a turbulent separation wake.
                  </span>
                ) : (
                  <span className="text-slate-300 block mt-1">
                    Flow remains attached across the suction surface. Trailing downwash confirms active Kutta-condition circulation.
                  </span>
                )}
              </p>
            </div>
          </section>

          {/* Right Column: Interactive Flight Parameter & Model Controls */}
          <section id="controls" className="lg:col-span-7 flex flex-col gap-4">
            <ControlsDeck
              params={params}
              onParamChange={handleParamChange}
              isPaused={isPaused}
              onTogglePause={() => setIsPaused((prev) => !prev)}
              onReset={handleReset}
              onOpenTheory={() => setIsTheoryOpen(true)}
              onOpenModelInspector={() => setIsModelViewerOpen(true)}
            />
          </section>
        </div>
      </main>

      {/* 3. FOOTER */}
      <footer className="mt-auto border-t border-slate-800/80 px-4 sm:px-8 py-4 text-xs text-slate-500 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-950/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
            <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
            <span>Hotkeys:</span>
          </div>
          <span className="font-mono text-[11px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-300">Space</span> Pause
          <span className="font-mono text-[11px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-300">↑/↓</span> Pitch AoA
          <span className="font-mono text-[11px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-300">←/→</span> Airspeed
          <span className="font-mono text-[11px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-300">M</span> Audio
          <span className="font-mono text-[11px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-300">R</span> Reset
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <button
            onClick={() => setIsTheoryOpen(true)}
            className="hover:text-cyan-400 transition-colors"
          >
            Flight Physics Theory Guide
          </button>
          <span>·</span>
          <span>By Shadat Hossen Mahin</span>
        </div>
      </footer>

      {/* Educational Theory Modal */}
      <AeroTheoryModal
        isOpen={isTheoryOpen}
        onClose={() => setIsTheoryOpen(false)}
      />

      {/* 3D CAD Asset Inspector Modal */}
      <ModelViewerModal
        isOpen={isModelViewerOpen}
        onClose={() => setIsModelViewerOpen(false)}
        onApplyToWindTunnel={(opts) => handleParamChange('landingGear', opts.landingGear)}
      />
    </div>
  );
}
