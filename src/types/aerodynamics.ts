export type AircraftModelType = 
  | 'f22' 
  | 'airliner' 
  | 'naca2412' 
  | 'naca0012' 
  | 'concorde' 
  | 'cylinder';

export interface AircraftModelConfig {
  id: AircraftModelType;
  name: string;
  category: 'Fighter' | 'Commercial' | 'Airfoil' | 'Supersonic' | 'Bluff Body';
  description: string;
  wingspan: number; // meters
  chord: number; // meters
  stallAngle: number; // degrees
  cl0: number; // lift at 0 aoa
  clMax: number;
  cd0: number; // parasitic drag
  flapCapable: boolean;
  supersonicCapable: boolean;
  glbPath?: string;
  hasGlbModel?: boolean;
}

export type VisualMode = 
  | 'streamlines' 
  | 'particles' 
  | 'heatmap' 
  | 'pressure' 
  | 'vectors' 
  | 'all';

export interface SimulationParams {
  modelType: AircraftModelType;
  angle_of_attack: number; // degrees (-20 to +35)
  airspeed_kts: number; // knots (40 to 1400)
  altitude_ft: number; // feet (0 to 50000)
  flaps_deg: number; // degrees (0 to 40)
  viscosity: number; // simulation viscosity
  smoke_density: number; // smoke trail thickness
  show_streamlines: boolean;
  show_particles: boolean;
  show_heatmap: boolean;
  show_pressure_vectors: boolean;
  show_quiver: boolean;
  show_shockwaves: boolean;
  audio_enabled: boolean;
  renderEngine?: 'webgl' | 'canvas';
  landingGear?: boolean;
  renderShading?: 'pbr' | 'wireframe' | 'cfdHeatmap' | 'xray';
}

export interface AeroTelemetry {
  cl: number; // Lift coefficient
  cd: number; // Drag coefficient
  ldRatio: number; // Lift-to-drag
  lift_N: number; // Lift force in Newtons
  drag_N: number; // Drag force in Newtons
  reynolds: number; // Re
  mach: number; // Mach number
  dynamic_pressure_pa: number; // q = 1/2 rho v^2
  air_density_kg_m3: number; // rho
  isStalled: boolean;
  stallMargin: number; // degrees before stall
  flowState: 'Laminar' | 'Attached Turbulent' | 'Incipient Stall' | 'Deep Stall' | 'Transonic Shock' | 'Supersonic Wave';
}

export interface Point2D {
  x: number;
  y: number;
}

export interface PolygonSurfacePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  isUpper: boolean;
  chordFraction: number; // 0 (leading edge) to 1 (trailing edge)
}
