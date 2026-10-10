import { useState, useMemo, useEffect } from 'react';
import { SimulationParams } from './types/aerodynamics';
import { calculateAeroTelemetry, AIRCRAFT_MODELS } from './utils/airfoilGenerators';
import { WindTunnelCanvas3D } from './components/WindTunnelCanvas3D';
import { WindTunnelCanvasWebGL } from './components/WindTunnelCanvasWebGL';
import { TelemetryHUD } from './components/TelemetryHUD';
import { AeroCharts } from './components/AeroCharts';
import { ControlsDeck } from './components/ControlsDeck';
import { AeroTheoryModal } from './components/AeroTheoryModal';
import { ModelViewerModal } from './components/ModelViewerModal';
import { 
  Plane, 
  BookOpen, 
  RotateCcw, 
  Wind, 
  Box, 
  Keyboard, 
  Sliders, 
  Activity, 
  PanelLeftClose, 
  PanelLeft, 
  PanelRightClose, 
  PanelRight, 
  Volume2, 
  VolumeX, 
  ShieldAlert,
  Flame,
  CheckCircle2,
  Gauge
} from 'lucide-react';

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
  const [mobileTab, setMobileTab] = useState<'controls' | 'tunnel' | 'results'>('tunnel');
  const [showLeftSidebar, setShowLeftSidebar] = useState<boolean>(true);
  const [showRightSidebar, setShowRightSidebar] = useState<boolean>(true);

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

  const currentModel = AIRCRAFT_MODELS[params.modelType];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#040711] text-slate-100 flex flex-col font-sans select-none selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. TOP BAR — CFD WORKSTATION NAVIGATION */}
      <header className="h-14 px-3 sm:px-4 border-b border-cyan-500/20 bg-[#060a14]/95 backdrop-blur-xl flex items-center justify-between z-30 flex-shrink-0 shadow-lg shadow-black/60">
        {/* Left Zone: Brand wordmark & flight status badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-950 to-slate-900 border border-cyan-500/60 flex items-center justify-center text-cyan-400 shadow-[0_0_14px_rgba(56,189,248,0.35)]">
              <Plane className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm sm:text-base font-bold tracking-tight text-white font-sans">
                AeroLab
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                CFD WORKSTATION
              </span>
            </div>
          </div>

          {/* Real-time status pill (Desktop) */}
          <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs">
            <span className="text-slate-300 font-medium font-sans">{currentModel.name}</span>
            <span className="text-slate-600">·</span>
            <span className="font-mono text-cyan-300 font-semibold">
              M {telemetry.mach.toFixed(2)}
            </span>
            <span className="text-slate-600">·</span>
            <span className="font-mono text-cyan-300 font-semibold">
              α {params.angle_of_attack >= 0 ? '+' : ''}{params.angle_of_attack.toFixed(1)}°
            </span>
            <span className="text-slate-600">·</span>
            <div className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${telemetry.isStalled ? 'bg-red-400 animate-ping' : 'bg-emerald-400'}`} />
              <span className={`text-[11px] font-mono ${telemetry.isStalled ? 'text-red-300 font-bold' : 'text-slate-400'}`}>
                {telemetry.flowState}
              </span>
            </div>
          </div>
        </div>

        {/* Center Zone: Mobile & Tablet Segmented Tab Switcher (< lg) */}
        <div className="flex lg:hidden items-center p-0.5 rounded-xl bg-slate-950 border border-cyan-500/30 text-xs">
          <button
            onClick={() => setMobileTab('controls')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              mobileTab === 'controls'
                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Controls</span>
          </button>
          <button
            onClick={() => setMobileTab('tunnel')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              mobileTab === 'tunnel'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>3D View</span>
          </button>
          <button
            onClick={() => setMobileTab('results')}
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              mobileTab === 'results'
                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Results</span>
          </button>
        </div>

        {/* Right Zone: Workstation Controls & Modal Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Desktop Left Sidebar Toggle */}
          <button
            onClick={() => setShowLeftSidebar((prev) => !prev)}
            className={`hidden lg:flex p-1.5 rounded-lg border transition-all text-xs font-semibold items-center gap-1.5 ${
              showLeftSidebar
                ? 'bg-slate-900 border-slate-700 text-cyan-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={showLeftSidebar ? 'Collapse Left Controls Deck' : 'Expand Left Controls Deck'}
          >
            {showLeftSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            <span className="hidden xl:inline text-[11px]">Controls</span>
          </button>

          {/* Desktop Right Sidebar Toggle */}
          <button
            onClick={() => setShowRightSidebar((prev) => !prev)}
            className={`hidden lg:flex p-1.5 rounded-lg border transition-all text-xs font-semibold items-center gap-1.5 ${
              showRightSidebar
                ? 'bg-slate-900 border-slate-700 text-cyan-300'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={showRightSidebar ? 'Collapse Right Telemetry Deck' : 'Expand Right Telemetry Deck'}
          >
            <span className="hidden xl:inline text-[11px]">Results</span>
            {showRightSidebar ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
          </button>

          <div className="hidden lg:block w-px h-5 bg-slate-800 mx-0.5" />

          {/* 3D CAD Asset Inspector Trigger */}
          <button
            onClick={() => setIsModelViewerOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-950/70 border border-cyan-400/40 hover:border-cyan-400 text-xs font-semibold text-cyan-200 hover:text-white transition-all flex items-center gap-1.5 shadow-sm hover:shadow-[0_0_15px_rgba(56,189,248,0.3)]"
            title="Inspect 3D GLB CAD Model with Full Turntable & Specifications"
          >
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">F-22 CAD</span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              GLB
            </span>
          </button>

          {/* Theory Modal Trigger */}
          <button
            onClick={() => setIsTheoryOpen(true)}
            className="hidden sm:flex px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-cyan-500/30 hover:border-cyan-500/60 text-xs font-semibold text-slate-200 hover:text-white transition-all items-center gap-1.5 whitespace-nowrap shadow-sm hover:shadow-[0_0_15px_rgba(56,189,248,0.25)]"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Theory</span>
          </button>

          {/* Audio Toggle */}
          <button
            onClick={() => setParams((p) => ({ ...p, audio_enabled: !p.audio_enabled }))}
            className={`p-1.5 rounded-lg border transition-all ${
              params.audio_enabled
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={params.audio_enabled ? 'Mute Audio (M)' : 'Enable Audio (M)'}
          >
            {params.audio_enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Reset Simulation Button */}
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 transition-colors border border-slate-800"
            title="Reset Simulation to Initial State (R)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN CFD WORKSTATION VIEWPORT & SIDEBARS */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 relative">
        {/* =========================================================================
            LEFT COLUMN: SIMULATION SETUP & FLIGHT CONTROLS DECK
            ========================================================================= */}
        <section
          id="controls"
          aria-label="Simulation Controls"
          className={`
            ${showLeftSidebar ? 'lg:flex lg:w-80 xl:w-96' : 'lg:hidden'}
            ${mobileTab === 'controls' ? 'flex flex-1 w-full' : 'hidden'}
            flex-shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-slate-800/80 bg-[#060913]/95 p-3.5 flex-col gap-3.5 z-20
          `}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
                Simulation Controls Deck
              </h2>
            </div>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/70 border border-cyan-500/30 px-1.5 py-0.5 rounded">
              PORT 1
            </span>
          </div>

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

        {/* =========================================================================
            CENTER COLUMN: FIXED 3D WIND TUNNEL VIEWPORT (CFD MAIN STAGE)
            ========================================================================= */}
        <section
          id="wind-tunnel"
          aria-label="3D Wind Tunnel Viewport"
          className={`
            ${mobileTab === 'tunnel' ? 'flex flex-1 w-full' : 'hidden lg:flex'}
            flex-1 h-full min-h-[400px] lg:min-h-0 relative flex-col overflow-hidden bg-[#03060d]
          `}
        >
          <div className="w-full h-full relative flex-1 min-h-0">
            {params.renderEngine !== 'canvas' ? (
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
                onOpenWebGL={() => handleParamChange('renderEngine', 'webgl')}
                onOpenModelInspector={() => setIsModelViewerOpen(true)}
              />
            )}
          </div>

          {/* Mobile Quick Action Overlay in 3D Viewport */}
          <div className="lg:hidden absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
            <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl">
              <span className="text-[10px] text-slate-400 font-mono pl-1">Pitch:</span>
              {[-5, 0, 5, 15].map((a) => (
                <button
                  key={a}
                  onClick={() => handleParamChange('angle_of_attack', a)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                    Math.abs(params.angle_of_attack - a) < 1
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400 font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {a >= 0 ? `+${a}°` : `${a}°`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                onClick={() => setIsPaused((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shadow-lg ${
                  isPaused ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-900/90 text-slate-200 border border-slate-700'
                }`}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================================
            RIGHT COLUMN: TELEMETRY & ANALYTICAL POLARS DECK
            ========================================================================= */}
        <section
          id="telemetry-results"
          aria-label="Flight Telemetry & Polars"
          className={`
            ${showRightSidebar ? 'lg:flex lg:w-88 xl:w-[420px]' : 'lg:hidden'}
            ${mobileTab === 'results' ? 'flex flex-1 w-full' : 'hidden'}
            flex-shrink-0 h-full overflow-y-auto custom-scrollbar border-l border-slate-800/80 bg-[#060913]/95 p-3.5 flex-col gap-3.5 z-20
          `}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
                Telemetry &amp; Results Deck
              </h2>
            </div>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/70 border border-cyan-500/30 px-1.5 py-0.5 rounded">
              PORT 2
            </span>
          </div>

          {/* Primary Telemetry Instruments */}
          <TelemetryHUD
            telemetry={telemetry}
            aoaDeg={params.angle_of_attack}
            modelType={params.modelType}
            params={params}
          />

          {/* Aerodynamic Polar Curves */}
          <AeroCharts
            modelType={params.modelType}
            currentAoa={params.angle_of_attack}
            airspeedKts={params.airspeed_kts}
            altitudeFt={params.altitude_ft}
            flapsDeg={params.flaps_deg}
            telemetry={telemetry}
          />

          {/* Real-Time Flow Dynamics Insight Card */}
          <div className="antigravity-glass-subtle p-3.5 rounded-xl text-xs text-slate-400 flex flex-col gap-2 leading-relaxed border border-slate-800/80">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <div className="w-5 h-5 rounded-md bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Wind className="w-3 h-3" />
              </div>
              <span className="text-cyan-200 font-bold text-xs">Real-Time Flow Dynamics Insight</span>
            </div>
            <p className="text-[11px] leading-relaxed">
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
      </main>

      {/* 3. WORKSTATION BOTTOM STATUS STRIP */}
      <footer className="h-7 border-t border-slate-800/80 bg-[#03060c] px-3 sm:px-4 flex items-center justify-between text-[11px] text-slate-400 z-30 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-1 text-slate-400 font-semibold">
            <Keyboard className="w-3 h-3 text-cyan-400" />
            <span>Hotkeys:</span>
          </div>
          <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 px-1 py-0.2 rounded text-slate-300">Space</span> Pause
          <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 px-1 py-0.2 rounded text-slate-300">↑/↓</span> Pitch AoA
          <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 px-1 py-0.2 rounded text-slate-300">←/→</span> Airspeed
          <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 px-1 py-0.2 rounded text-slate-300">M</span> Audio
          <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 px-1 py-0.2 rounded text-slate-300">R</span> Reset
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
          <span>ISA Standard Atm</span>
          <span>·</span>
          <span>FL{params.altitude_ft.toLocaleString()}</span>
          <span>·</span>
          <span>ρ = {telemetry.air_density_kg_m3.toFixed(3)} kg/m³</span>
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-[10px]">
          <button
            onClick={() => setIsTheoryOpen(true)}
            className="hover:text-cyan-400 transition-colors"
          >
            Flight Physics Theory Guide
          </button>
          <span>·</span>
          <span className="hidden md:inline">AeroLab Workstation</span>
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
        activeModelType={params.modelType}
        onSelectModel={(modelType) => handleParamChange('modelType', modelType)}
        onApplyToWindTunnel={(opts) => {
          handleParamChange('modelType', opts.modelType);
          if (opts.landingGear !== undefined) {
            handleParamChange('landingGear', opts.landingGear);
          }
        }}
      />
    </div>
  );
}
