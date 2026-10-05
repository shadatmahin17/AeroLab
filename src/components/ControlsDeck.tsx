import React, { useState, useEffect } from 'react';
import { SimulationParams, AircraftModelType } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import { 
  Plane, 
  Wind, 
  Layers, 
  Play, 
  Pause, 
  RotateCcw, 
  Flame, 
  Compass,
  Repeat
} from 'lucide-react';

interface ControlsDeckProps {
  params: SimulationParams;
  onParamChange: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onReset: () => void;
  onOpenTheory: () => void;
}

export const ControlsDeck: React.FC<ControlsDeckProps> = ({
  params,
  onParamChange,
  isPaused,
  onTogglePause,
  onReset,
}) => {
  const currentModel = AIRCRAFT_MODELS[params.modelType];
  const [isAutoSweeping, setIsAutoSweeping] = useState(false);
  const sweepDirRef = React.useRef<number>(1);

  // Dynamic Auto AoA Flight Sweep
  useEffect(() => {
    if (!isAutoSweeping || isPaused) return;

    const interval = setInterval(() => {
      let nextAoa = params.angle_of_attack + sweepDirRef.current * 0.4;
      if (nextAoa >= 24) {
        sweepDirRef.current = -1;
        nextAoa = 24;
      } else if (nextAoa <= -4) {
        sweepDirRef.current = 1;
        nextAoa = -4;
      }
      onParamChange('angle_of_attack', parseFloat(nextAoa.toFixed(1)));
    }, 60);

    return () => clearInterval(interval);
  }, [isAutoSweeping, isPaused, params.angle_of_attack, onParamChange]);

  // Flight presets
  const presets: { name: string; desc: string; apply: () => void }[] = [
    {
      name: 'High-Speed Cruise',
      desc: 'Optimal L/D glide, low drag',
      apply: () => {
        setIsAutoSweeping(false);
        onParamChange('modelType', 'airliner');
        onParamChange('angle_of_attack', 2.5);
        onParamChange('airspeed_kts', 490);
        onParamChange('altitude_ft', 35000);
        onParamChange('flaps_deg', 0);
      },
    },
    {
      name: 'Takeoff Climb',
      desc: 'High lift with flaps 20°',
      apply: () => {
        setIsAutoSweeping(false);
        onParamChange('modelType', 'airliner');
        onParamChange('angle_of_attack', 10.5);
        onParamChange('airspeed_kts', 165);
        onParamChange('altitude_ft', 1500);
        onParamChange('flaps_deg', 20);
      },
    },
    {
      name: 'Deep Aerodynamic Stall',
      desc: 'Flow boundary detachment & wake',
      apply: () => {
        setIsAutoSweeping(false);
        onParamChange('modelType', 'naca2412');
        onParamChange('angle_of_attack', 21.0);
        onParamChange('airspeed_kts', 110);
        onParamChange('altitude_ft', 4000);
        onParamChange('flaps_deg', 0);
      },
    },
    {
      name: 'Supersonic Dash (M 1.6)',
      desc: 'Sharp oblique Mach shockwave',
      apply: () => {
        setIsAutoSweeping(false);
        onParamChange('modelType', 'concorde');
        onParamChange('angle_of_attack', 3.0);
        onParamChange('airspeed_kts', 1050);
        onParamChange('altitude_ft', 45000);
        onParamChange('flaps_deg', 0);
        onParamChange('show_shockwaves', true);
      },
    },
    {
      name: 'Fighter High-Alpha Turn',
      desc: 'Vortex lift at high AoA',
      apply: () => {
        setIsAutoSweeping(false);
        onParamChange('modelType', 'f22');
        onParamChange('angle_of_attack', 18.0);
        onParamChange('airspeed_kts', 320);
        onParamChange('altitude_ft', 15000);
        onParamChange('flaps_deg', 0);
      },
    },
    {
      name: 'Cylinder Vortex Street',
      desc: 'Symmetric bluff body separation',
      apply: () => {
        setIsAutoSweeping(false);
        onParamChange('modelType', 'cylinder');
        onParamChange('angle_of_attack', 0.0);
        onParamChange('airspeed_kts', 140);
        onParamChange('altitude_ft', 1000);
        onParamChange('flaps_deg', 0);
      },
    },
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 1. Aircraft Model Selection (Antigravity Spatial Selection) */}
      <div className="antigravity-glass p-5 rounded-2xl flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-cyan-950/70 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Plane className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
              3D Aircraft & Airfoil Profile Select
            </span>
          </div>
          <span className="text-xs text-slate-300 bg-slate-900/70 px-2.5 py-1 rounded-lg border border-white/5">
            Current: <strong className="text-cyan-300 font-mono">{currentModel.name}</strong>
          </span>
        </div>

        {/* Aircraft Model Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 perspective-1000">
          {(Object.keys(AIRCRAFT_MODELS) as AircraftModelType[]).map((type) => {
            const config = AIRCRAFT_MODELS[type];
            const isSelected = params.modelType === type;
            return (
              <button
                key={type}
                onClick={() => {
                  onParamChange('modelType', type);
                  if (!config.flapCapable) onParamChange('flaps_deg', 0);
                }}
                className={`antigravity-card p-3 rounded-xl text-left flex flex-col justify-between transition-all ${
                  isSelected
                    ? '!bg-cyan-950/70 !border-cyan-400/80 shadow-[0_0_20px_rgba(56,189,248,0.35)] text-white scale-[1.02]'
                    : 'text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    isSelected ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40' : 'bg-slate-800/80 text-slate-400'
                  }`}>
                    {config.category}
                  </span>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />}
                </div>
                <span className={`text-xs font-bold leading-tight ${isSelected ? 'text-cyan-100' : 'text-slate-200'}`}>
                  {config.name.split(' (')[0]}
                </span>
                <span className="text-[11px] text-slate-400 truncate mt-1">
                  Stall: {config.stallAngle > 0 ? `${config.stallAngle}°` : 'N/A'}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 leading-relaxed italic border-t border-cyan-500/15 pt-2.5">
          {currentModel.description}
        </p>
      </div>

      {/* 2. Interactive Primary Flight Sliders (Antigravity Spatial Sliders) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 perspective-1000">
        {/* Left Column: AoA & Flaps */}
        <div className="antigravity-glass p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between text-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Compass className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
                Attitude & Control Surfaces
              </span>
            </div>

            {/* Dynamic Auto Sweep Toggle */}
            <button
              onClick={() => setIsAutoSweeping((prev) => !prev)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isAutoSweeping
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/70 shadow-[0_0_12px_rgba(52,211,153,0.35)] animate-pulse'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/10 hover:border-cyan-500/40'
              }`}
              title="Continuously sweep Angle of Attack dynamically"
            >
              <Repeat className={`w-3.5 h-3.5 ${isAutoSweeping ? 'animate-spin' : ''}`} />
              <span>{isAutoSweeping ? 'Auto Sweep ON' : 'Auto Sweep'}</span>
            </button>
          </div>

          {/* Angle of Attack (AoA) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="aoa-slider" className="text-slate-200 font-semibold">Angle of Attack (α)</label>
              <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30">
                {params.angle_of_attack >= 0 ? '+' : ''}{params.angle_of_attack.toFixed(1)}°
              </span>
            </div>
            <input
              id="aoa-slider"
              type="range"
              min="-20"
              max="35"
              step="0.5"
              value={params.angle_of_attack}
              onChange={(e) => {
                setIsAutoSweeping(false);
                onParamChange('angle_of_attack', parseFloat(e.target.value));
              }}
              className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            {/* Quick AoA shortcuts */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
              {[-10, 0, 5, 12, 18, 25].map((val) => (
                <button
                  key={val}
                  onClick={() => {
                    setIsAutoSweeping(false);
                    onParamChange('angle_of_attack', val);
                  }}
                  className={`px-2 py-0.5 rounded-lg border transition-all ${
                    Math.abs(params.angle_of_attack - val) < 0.6
                      ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/60 font-semibold shadow-sm'
                      : 'border-transparent hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {val >= 0 ? `+${val}°` : `${val}°`}
                </button>
              ))}
            </div>
          </div>

          {/* Trailing Edge Flaps */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="flaps-slider" className="text-slate-200 font-semibold">
                Trailing Flap Deflection (δf)
              </label>
              <span className="font-mono text-amber-300 font-bold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30">
                {params.flaps_deg}° {params.flaps_deg > 0 ? '(High-Lift Mode)' : '(Clean Wing)'}
              </span>
            </div>
            <input
              id="flaps-slider"
              type="range"
              min="0"
              max={currentModel.flapCapable ? '35' : '0'}
              step="5"
              disabled={!currentModel.flapCapable}
              value={params.flaps_deg}
              onChange={(e) => onParamChange('flaps_deg', parseInt(e.target.value, 10))}
              className={`w-full h-2 rounded-lg ${
                currentModel.flapCapable ? 'accent-amber-400 cursor-pointer bg-slate-800' : 'opacity-40 cursor-not-allowed bg-slate-800'
              }`}
            />
            {!currentModel.flapCapable && (
              <span className="text-[11px] text-slate-500 italic">
                Flap deflection not available for this geometry
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Airspeed & Altitude */}
        <div className="antigravity-glass p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center gap-2 text-slate-200">
            <div className="w-7 h-7 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Wind className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
              Atmospheric Flight Envelope
            </span>
          </div>

          {/* Inflow Airspeed */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="airspeed-slider" className="text-slate-200 font-semibold">Inflow Airspeed</label>
              <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30">
                {params.airspeed_kts} kts ({(params.airspeed_kts * 1.852).toFixed(0)} km/h)
              </span>
            </div>
            <input
              id="airspeed-slider"
              type="range"
              min="20"
              max="1200"
              step="10"
              value={params.airspeed_kts}
              onChange={(e) => onParamChange('airspeed_kts', parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Approach (120 kts)</span>
              <span>Subsonic (450 kts)</span>
              <span>Mach 1+ (700+ kts)</span>
            </div>
          </div>

          {/* Altitude */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="altitude-slider" className="text-slate-200 font-semibold">Test Altitude (ISA Standard)</label>
              <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30">
                {params.altitude_ft.toLocaleString()} ft
              </span>
            </div>
            <input
              id="altitude-slider"
              type="range"
              min="0"
              max="50000"
              step="1000"
              value={params.altitude_ft}
              onChange={(e) => onParamChange('altitude_ft', parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Sea Level (1.225 kg/m³)</span>
              <span>FL350 Cruise</span>
              <span>FL480 Stratosphere</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Visualization Toggles & Fluid Tuning */}
      <div className="antigravity-glass p-5 rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
              Visualization Overlays & Diagnostics
            </span>
          </div>

          {/* Play / Pause & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={onTogglePause}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                isPaused
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : 'bg-slate-900/90 text-slate-200 hover:text-white border border-white/10 hover:border-cyan-500/40'
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              onClick={onReset}
              className="p-1.5 rounded-xl bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-cyan-500/40 transition-colors"
              title="Reset Simulation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toggle switches */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 perspective-1000">
          {[
            { key: 'show_streamlines', label: 'Smoke Lines', desc: 'Vapor ribbons' },
            { key: 'show_heatmap', label: 'Velocity Heatmap', desc: 'Speed gradient' },
            { key: 'show_pressure_vectors', label: 'Force Vectors', desc: 'Lift & Drag 3D' },
            { key: 'show_particles', label: 'Flow Particles', desc: 'PIV streaks' },
            { key: 'show_quiver', label: 'Vector Quiver', desc: 'Direction arrows' },
            { key: 'show_shockwaves', label: 'Mach Shockwaves', desc: 'Supersonic cone' },
          ].map((item) => {
            const active = params[item.key as keyof SimulationParams] as boolean;
            return (
              <button
                key={item.key}
                onClick={() =>
                  onParamChange(item.key as keyof SimulationParams, !active as never)
                }
                className={`antigravity-card p-3 rounded-xl text-left flex flex-col justify-between transition-all ${
                  active
                    ? '!bg-cyan-950/60 !border-cyan-400/80 text-slate-100 shadow-[0_0_16px_rgba(56,189,248,0.25)]'
                    : 'text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-200">{item.label}</span>
                  <div
                    className={`w-3 h-3 rounded-full border transition-all ${
                      active ? 'bg-cyan-400 border-cyan-400 shadow-[0_0_8px_#38bdf8]' : 'border-slate-600 bg-slate-900'
                    }`}
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1">{item.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Smoke density & viscosity sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="viscosity-slider" className="text-slate-300 font-medium">Air Kinematic Viscosity (ν)</label>
              <span className="font-mono text-cyan-300 font-bold">{params.viscosity.toFixed(2)}</span>
            </div>
            <input
              id="viscosity-slider"
              type="range"
              min="0.01"
              max="0.40"
              step="0.01"
              value={params.viscosity}
              onChange={(e) => onParamChange('viscosity', parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="smoke-slider" className="text-slate-300 font-medium">Smoke Streamer Intensity</label>
              <span className="font-mono text-cyan-300 font-bold">{params.smoke_density.toFixed(1)}x</span>
            </div>
            <input
              id="smoke-slider"
              type="range"
              min="0.2"
              max="2.5"
              step="0.1"
              value={params.smoke_density}
              onChange={(e) => onParamChange('smoke_density', parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 4. One-Click Flight Scenarios */}
      <div className="antigravity-glass p-5 rounded-2xl flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-amber-950/70 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Flame className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-100 font-sans">
            Quick Flight Scenarios & Experiments
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 perspective-1000">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={preset.apply}
              className="antigravity-card p-3 rounded-xl text-left transition-all group flex flex-col justify-between"
            >
              <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                {preset.name}
              </span>
              <span className="text-[11px] text-slate-400 mt-1 leading-tight">
                {preset.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
