import { AircraftModelType } from '../types/aerodynamics';

export interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

export interface Face3D {
  indices: number[];
  baseColor: string;
  isCanopy?: boolean;
  isWing?: boolean;
  isEngine?: boolean;
  isFlap?: boolean;
  isCockpit?: boolean;
  isIntake?: boolean;
  isAfterburner?: boolean;
  isStab?: boolean;
  /** Role of a flat (zero-thickness) lifting-surface face; used to enforce normal direction (upper -> +Y, lower -> -Y). */
  surface?: 'upper' | 'lower';
  chordFraction?: number; // 0 (leading edge) to 1 (trailing edge) for dynamic CFD pressure heatmap
}

export interface Aircraft3DMeshData {
  vertices: Vertex3D[];
  faces: Face3D[];
  name: string;
  exhaustPoints?: Vertex3D[];
  intakePoints?: Vertex3D[];
}

/**
 * Unit face normal via Newell's method. Unlike a cross product of the first three
 * vertices it is correct for concave, near-collinear and slightly non-planar polygons
 * (the delta wings and twisted intake quads are all of those).
 */
export function computeFaceNormal(vertices: Vertex3D[], indices: number[]): Vertex3D {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < indices.length; i++) {
    const a = vertices[indices[i]];
    const b = vertices[indices[(i + 1) % indices.length]];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

/** Flip a face so its normal points away from `center` (for closed bodies). */
function orientOutward(vertices: Vertex3D[], face: Face3D, center: Vertex3D): void {
  const n = computeFaceNormal(vertices, face.indices);
  const c = face.indices.reduce(
    (acc, i) => ({ x: acc.x + vertices[i].x, y: acc.y + vertices[i].y, z: acc.z + vertices[i].z }),
    { x: 0, y: 0, z: 0 }
  );
  const k = face.indices.length;
  const d = (c.x / k - center.x) * n.x + (c.y / k - center.y) * n.y + (c.z / k - center.z) * n.z;
  if (d < 0) face.indices.reverse();
}

/** Enforce upper-surface faces to point +Y and lower-surface faces -Y (renderer colours by sign of n.y). */
function orientLiftingSurfaces(mesh: Aircraft3DMeshData): Aircraft3DMeshData {
  for (const f of mesh.faces) {
    if (!f.surface) continue;
    const ny = computeFaceNormal(mesh.vertices, f.indices).y;
    if ((f.surface === 'upper' && ny < 0) || (f.surface === 'lower' && ny > 0)) f.indices.reverse();
  }
  return mesh;
}

/** Add a closed 5-face nacelle box. b = bottom [frontOuter, frontInner, rearOuter, rearInner], t = matching top vertices. */
function addNacelleBox(vertices: Vertex3D[], faces: Face3D[], b: number[], t: number[], color: string): void {
  const all = [...b, ...t].map((i) => vertices[i]);
  const center = {
    x: all.reduce((s, v) => s + v.x, 0) / all.length,
    y: all.reduce((s, v) => s + v.y, 0) / all.length,
    z: all.reduce((s, v) => s + v.z, 0) / all.length,
  };
  const boxFaces: Face3D[] = [
    { indices: [b[0], b[1], b[3], b[2]], baseColor: color, isEngine: true }, // bottom
    { indices: [b[0], b[2], t[2], t[0]], baseColor: color, isEngine: true }, // outboard side
    { indices: [b[1], t[1], t[3], b[3]], baseColor: color, isEngine: true }, // inboard side
    { indices: [b[0], t[0], t[1], b[1]], baseColor: '#020617', isEngine: true, isIntake: true }, // intake
    { indices: [b[2], b[3], t[3], t[2]], baseColor: '#0f172a', isEngine: true }, // nozzle
  ];
  for (const f of boxFaces) {
    orientOutward(vertices, f, center);
    faces.push(f);
  }
}

/**
 * 1. F-22 Raptor 5th-Gen Stealth Fighter (Blender CAD Quality & Fully Dynamic)
 * Dynamic features:
 * - All-moving horizontal tailerons pitch dynamically with Angle of Attack (pitch trim)
 * - Caret supersonic stealth intakes and Pratt & Whitney F119 2D vectoring afterburner petals
 * - Iridescent gold-tinted indium tin oxide canopy
 * - Faceted stealth chine forebody and 28-degree canted twin vertical stabilizers
 */
function createF22Geometry(aoaDeg = 0, airspeedKts = 350): Aircraft3DMeshData {
  // Dynamic taileron pitch deflection (trims opposite to AoA)
  const trimAngleDeg = Math.max(-20, Math.min(25, -aoaDeg * 0.65));
  const trimRad = (trimAngleDeg * Math.PI) / 180;
  const cosT = Math.cos(trimRad);
  const sinT = Math.sin(trimRad);

  // Helper to rotate stabilator points around the spanwise hinge line (x=2.8, y=0.04)
  const rotateStabilator = (p: Vertex3D): Vertex3D => {
    const dx = p.x - 2.8;
    const dy = p.y - 0.04;
    return {
      x: 2.8 + (dx * cosT - dy * sinT),
      y: 0.04 + (dx * sinT + dy * cosT),
      z: p.z,
    };
  };

  // Base stabilator vertices before dynamic deflection
  const stabR1 = rotateStabilator({ x: 3.8, y: -0.05, z: -2.95 });
  const stabR2 = rotateStabilator({ x: 4.8, y: -0.05, z: -2.65 });
  const stabR3 = rotateStabilator({ x: 4.7, y: 0.02, z: -0.85 });

  const stabL1 = rotateStabilator({ x: 3.8, y: -0.05, z: 2.95 });
  const stabL2 = rotateStabilator({ x: 4.8, y: -0.05, z: 2.65 });
  const stabL3 = rotateStabilator({ x: 4.7, y: 0.02, z: 0.85 });

  // Vertical fins are canted 28 deg from vertical (as on the real F-22): horizontal offset = height * tan(28 deg)
  const finRootZ = 1.25;
  const finTipZ = finRootZ + (2.75 - 0.38) * Math.tan((28 * Math.PI) / 180);

  // Dynamic 2D afterburner nozzle throat contraction at high speeds
  const nozzleAftX = airspeedKts >= 480 ? 5.4 : 5.25;

  const vertices: Vertex3D[] = [
    // Nose Radome & Chines (0 - 7)
    { x: -6.2, y: -0.05, z: 0.0 },     // 0: Pitot nose tip
    { x: -4.8, y: 0.28, z: 0.0 },      // 1: Radome upper ridge
    { x: -4.8, y: -0.25, z: 0.0 },     // 2: Radome lower keel
    { x: -4.6, y: 0.02, z: -0.75 },    // 3: Chine right
    { x: -4.6, y: 0.02, z: 0.75 },     // 4: Chine left
    { x: -3.4, y: 0.38, z: 0.0 },      // 5: Canopy forward base
    { x: -3.2, y: 0.08, z: -1.05 },    // 6: Forebody chine R
    { x: -3.2, y: 0.08, z: 1.05 },     // 7: Forebody chine L

    // Gold-Tinted Stealth Cockpit Canopy & Frame (8 - 14)
    { x: -2.0, y: 0.95, z: 0.0 },      // 8: Canopy bubble apex
    { x: -0.8, y: 0.72, z: 0.0 },      // 9: Canopy aft bulkhead
    { x: -2.0, y: 0.58, z: -0.65 },    // 10: Canopy frame mid R
    { x: -2.0, y: 0.58, z: 0.65 },     // 11: Canopy frame mid L
    { x: -0.8, y: 0.50, z: -0.75 },    // 12: Canopy frame aft R
    { x: -0.8, y: 0.50, z: 0.75 },     // 13: Canopy frame aft L
    { x: -3.3, y: -0.35, z: 0.0 },     // 14: Forebody belly keel

    // Caret Air Intakes (15 - 22)
    { x: -1.8, y: -0.25, z: -1.35 },   // 15: Intake R upper lip
    { x: -1.8, y: -0.72, z: -1.25 },   // 16: Intake R lower lip
    { x: -1.8, y: -0.62, z: -0.55 },   // 17: Intake R inner lower
    { x: -1.8, y: -0.15, z: -0.55 },   // 18: Intake R inner upper
    { x: -1.8, y: -0.25, z: 1.35 },    // 19: Intake L upper lip
    { x: -1.8, y: -0.72, z: 1.25 },    // 20: Intake L lower lip
    { x: -1.8, y: -0.62, z: 0.55 },    // 21: Intake L inner lower
    { x: -1.8, y: -0.15, z: 0.55 },    // 22: Intake L inner upper

    // Fuselage Spine & Keel (23 - 30)
    { x: 0.2, y: 0.52, z: 0.0 },       // 23: Mid spine center
    { x: 0.2, y: -0.58, z: 0.0 },      // 24: Mid belly center
    { x: 0.2, y: 0.15, z: -1.55 },     // 25: Mid fuselage flank R
    { x: 0.2, y: 0.15, z: 1.55 },      // 26: Mid fuselage flank L
    { x: 2.8, y: 0.42, z: 0.0 },       // 27: Aft spine center
    { x: 2.8, y: -0.45, z: 0.0 },      // 28: Aft belly center
    { x: 2.6, y: 0.12, z: -1.35 },     // 29: Aft flank R
    { x: 2.6, y: 0.12, z: 1.35 },      // 30: Aft flank L

    // Diamond Wings with Leading Edge Extension (31 - 42)
    { x: -2.8, y: 0.10, z: -1.1 },     // 31: LEX apex R
    { x: -0.5, y: 0.06, z: -2.5 },     // 32: Wing root leading R
    { x: 1.1, y: 0.02, z: -5.4 },      // 33: Wingtip leading R
    { x: 1.8, y: 0.02, z: -5.4 },      // 34: Wingtip trailing R
    { x: 1.9, y: 0.04, z: -4.0 },      // 35: Aileron mid R
    { x: 2.9, y: 0.08, z: -1.35 },     // 36: Wing root trailing R
    { x: -2.8, y: 0.10, z: 1.1 },      // 37: LEX apex L
    { x: -0.5, y: 0.06, z: 2.5 },      // 38: Wing root leading L
    { x: 1.1, y: 0.02, z: 5.4 },       // 39: Wingtip leading L
    { x: 1.8, y: 0.02, z: 5.4 },       // 40: Wingtip trailing L
    { x: 1.9, y: 0.04, z: 4.0 },       // 41: Aileron mid L
    { x: 2.9, y: 0.08, z: 1.35 },      // 42: Wing root trailing L

    // Twin Canted Vertical Stabilizers (28 deg outward cant) (43 - 50)
    { x: 1.5, y: 0.38, z: -1.25 },     // 43: Right fin root lead
    { x: 2.6, y: 2.75, z: -finTipZ },    // 44: Right fin tip lead
    { x: 3.5, y: 2.75, z: -finTipZ },    // 45: Right fin tip trail
    { x: 3.9, y: 0.30, z: -1.25 },     // 46: Right fin root trail
    { x: 1.5, y: 0.38, z: 1.25 },      // 47: Left fin root lead
    { x: 2.6, y: 2.75, z: finTipZ },     // 48: Left fin tip lead
    { x: 3.5, y: 2.75, z: finTipZ },     // 49: Left fin tip trail
    { x: 3.9, y: 0.30, z: 1.25 },      // 50: Left fin root trail

    // Dynamic All-Moving Horizontal Tailerons (Deflected by AoA Trim) (51 - 58)
    { x: 2.8, y: 0.04, z: -1.15 },     // 51: Right stab pivot
    stabR1,                             // 52: Deflected tip lead R
    stabR2,                             // 53: Deflected tip trail R
    stabR3,                             // 54: Deflected root trail R
    { x: 2.8, y: 0.04, z: 1.15 },      // 55: Left stab pivot
    stabL1,                             // 56: Deflected tip lead L
    stabL2,                             // 57: Deflected tip trail L
    stabL3,                             // 58: Deflected root trail L

    // 2D Stealth Vectoring Nozzles (59 - 66)
    { x: 4.5, y: 0.22, z: -0.8 },      // 59: Nozzle R top
    { x: 4.5, y: -0.25, z: -0.8 },     // 60: Nozzle R bottom
    { x: nozzleAftX, y: 0.12, z: -0.8 },  // 61: Nozzle R petal top
    { x: nozzleAftX, y: -0.15, z: -0.8 }, // 62: Nozzle R petal bottom
    { x: 4.5, y: 0.22, z: 0.8 },       // 63: Nozzle L top
    { x: 4.5, y: -0.25, z: 0.8 },      // 64: Nozzle L bottom
    { x: nozzleAftX, y: 0.12, z: 0.8 },   // 65: Nozzle L petal top
    { x: nozzleAftX, y: -0.15, z: 0.8 },  // 66: Nozzle L petal bottom
  ];

  const faces: Face3D[] = [
    // Radome Chine Faces (Stealth Tactical Charcoal & Slate with Blue Undertone)
    { indices: [0, 1, 3], baseColor: '#334155', chordFraction: 0.05 },
    { indices: [0, 4, 1], baseColor: '#3b4d61', chordFraction: 0.05 },
    { indices: [0, 3, 2], baseColor: '#1e293b', chordFraction: 0.05 },
    { indices: [0, 2, 4], baseColor: '#1e293b', chordFraction: 0.05 },
    { indices: [1, 5, 6, 3], baseColor: '#334155', chordFraction: 0.15 },
    { indices: [1, 4, 7, 5], baseColor: '#3b4d61', chordFraction: 0.15 },
    { indices: [2, 3, 6, 14], baseColor: '#1e293b', chordFraction: 0.15 },
    { indices: [2, 14, 7, 4], baseColor: '#1e293b', chordFraction: 0.15 },

    // Gold-Tinted Stealth Cockpit Bubble Canopy (Indium Tin Oxide Glass)
    { indices: [5, 8, 10], baseColor: '#f59e0b', isCanopy: true, chordFraction: 0.25 },
    { indices: [5, 11, 8], baseColor: '#d97706', isCanopy: true, chordFraction: 0.25 },
    { indices: [8, 9, 12, 10], baseColor: '#b45309', isCanopy: true, chordFraction: 0.35 },
    { indices: [8, 11, 13, 9], baseColor: '#f59e0b', isCanopy: true, chordFraction: 0.35 },

    // Forebody to Intake Ramps
    { indices: [6, 10, 12, 25], baseColor: '#334155', chordFraction: 0.3 },
    { indices: [7, 26, 13, 11], baseColor: '#3b4d61', chordFraction: 0.3 },
    { indices: [14, 18, 17, 24], baseColor: '#0f172a', chordFraction: 0.3 },
    { indices: [14, 24, 21, 22], baseColor: '#0f172a', chordFraction: 0.3 },

    // Caret Intake Cavities (Jet Black Deep Duct)
    { indices: [15, 16, 17, 18], baseColor: '#020617', isIntake: true, chordFraction: 0.3 },
    { indices: [19, 22, 21, 20], baseColor: '#020617', isIntake: true, chordFraction: 0.3 },

    // Upper Fuselage Spine & Composite Skin
    { indices: [9, 23, 25, 12], baseColor: '#334155', chordFraction: 0.45 },
    { indices: [9, 13, 26, 23], baseColor: '#3b4d61', chordFraction: 0.45 },
    { indices: [23, 27, 29, 25], baseColor: '#334155', chordFraction: 0.65 },
    { indices: [23, 26, 30, 27], baseColor: '#3b4d61', chordFraction: 0.65 },

    // Lower Fuselage & Weapons Bay Belly
    { indices: [24, 28, 29, 25], baseColor: '#1e293b', chordFraction: 0.55 },
    { indices: [24, 26, 30, 28], baseColor: '#1e293b', chordFraction: 0.55 },

    // Right Diamond Wing (Upper & Lower in Aerodynamic Slate with Electric Blue Accent)
    { indices: [31, 32, 33, 34, 35, 36, 25], surface: 'upper', baseColor: '#2563eb', isWing: true, chordFraction: 0.5 },
    { indices: [31, 25, 36, 35, 34, 33, 32], surface: 'lower', baseColor: '#1e293b', isWing: true, chordFraction: 0.5 },

    // Left Diamond Wing
    { indices: [37, 26, 42, 41, 40, 39, 38], surface: 'upper', baseColor: '#2563eb', isWing: true, chordFraction: 0.5 },
    { indices: [37, 38, 39, 40, 41, 42, 26], surface: 'lower', baseColor: '#1e293b', isWing: true, chordFraction: 0.5 },

    // Right Vertical Stabilizer (28 deg cant with USAF tactical blue insignia)
    { indices: [43, 44, 45, 46], baseColor: '#3b82f6', chordFraction: 0.7 },
    { indices: [43, 46, 45, 44], baseColor: '#1d4ed8', chordFraction: 0.7 },

    // Left Vertical Stabilizer
    { indices: [47, 48, 49, 50], baseColor: '#3b82f6', chordFraction: 0.7 },
    { indices: [47, 50, 49, 48], baseColor: '#1d4ed8', chordFraction: 0.7 },

    // Right Dynamic Taileron Stabilator (Deflects with AoA Trim)
    { indices: [51, 52, 53, 54], surface: 'upper', baseColor: '#38bdf8', isWing: true, isStab: true, chordFraction: 0.9 },
    { indices: [51, 54, 53, 52], surface: 'lower', baseColor: '#1e293b', isWing: true, isStab: true, chordFraction: 0.9 },

    // Left Dynamic Taileron Stabilator
    { indices: [55, 56, 57, 58], surface: 'upper', baseColor: '#38bdf8', isWing: true, isStab: true, chordFraction: 0.9 },
    { indices: [55, 58, 57, 56], surface: 'lower', baseColor: '#1e293b', isWing: true, isStab: true, chordFraction: 0.9 },

    // 2D Vectoring Thrust Exhaust Nozzles with Incandescent Reheat
    { indices: [27, 59, 60, 28], baseColor: '#0f172a', isEngine: true },
    { indices: [59, 61, 62, 60], baseColor: '#f97316', isEngine: true, isAfterburner: true },
    { indices: [28, 64, 63, 27], baseColor: '#0f172a', isEngine: true },
    { indices: [64, 66, 65, 63], baseColor: '#f97316', isEngine: true, isAfterburner: true },
  ];

  const exhaustPoints = [
    { x: nozzleAftX + 0.1, y: 0.0, z: -0.8 },
    { x: nozzleAftX + 0.1, y: 0.0, z: 0.8 },
  ];

  return orientLiftingSurfaces({ vertices, faces, name: 'F-22 Raptor (5th-Gen Stealth Fighter)', exhaustPoints });
}

/**
 * 2. Boeing 787 Dreamliner (Blender CAD Quality & Fully Dynamic)
 * Dynamic features:
 * - Dynamic aeroelastic wing flex (upward arc scaling with the lift force, 0 -> 2.4 MN)
 * - Trailing edge double-slotted Fowler flaps that physically deploy with flaps_deg
 * - High-bypass GEnx turbofans with iconic Dreamliner chevron serrations and blue cowlings
 * - Vibrant airline livery: High-gloss white fuselage, signature aerodynamic azure cheatline
 */
const AIRLINER_REF_LIFT_N = 2.4e6; // ~1 g lift of a 787-9 at ~245 t
function createAirlinerGeometry(flapDeg = 0, _airspeedKts = 490, liftForceN = 0): Aircraft3DMeshData {
  const vertices: Vertex3D[] = [];
  const faces: Face3D[] = [];

  // Dynamic Flap deflection
  const flapRad = (flapDeg * Math.PI) / 180;
  const flapDrop = flapDeg > 0 ? Math.sin(flapRad) * 0.55 : 0;
  const flapAft = flapDeg > 0 ? Math.cos(flapRad) * 0.22 : 0;

  // Dynamic Aeroelastic Wing Flex (Dreamliner upward curve)
  // Lift (which already contains the V^2 dependence) maps linearly onto tip deflection; 1.0 = 1 g cruise.
  const flexFactor = Math.max(-0.25, Math.min(1.2, liftForceN / AIRLINER_REF_LIFT_N));
  const tipFlexY = 0.55 * flexFactor;

  // Streamline Fuselage (12 rings along X, 10 radial points)
  const numRings = 12;
  const numRad = 10;
  const length = 12.0;
  const radius = 1.15;

  for (let r = 0; r < numRings; r++) {
    const t = r / (numRings - 1);
    const x = -6.2 + t * length;

    let rad = radius;
    let yOffset = 0;
    if (r === 0) {
      rad = 0.08;
      yOffset = -0.15;
    } else if (r === 1) {
      rad = radius * 0.55;
      yOffset = -0.08;
    } else if (r === 2) {
      rad = radius * 0.88;
      yOffset = -0.02;
    } else if (r >= numRings - 3) {
      const tailT = (r - (numRings - 3)) / 2;
      rad = radius * (1 - tailT * 0.8);
      yOffset = tailT * 0.32;
    }

    for (let i = 0; i < numRad; i++) {
      const angle = (2 * Math.PI * i) / numRad;
      const y = Math.cos(angle) * rad + yOffset;
      const z = Math.sin(angle) * rad;
      vertices.push({ x, y, z });
    }
  }

  // Create fuselage quad faces with commercial airline livery
  for (let r = 0; r < numRings - 1; r++) {
    for (let i = 0; i < numRad; i++) {
      const iNext = (i + 1) % numRad;
      const idx0 = r * numRad + i;
      const idx1 = r * numRad + iNext;
      const idx2 = (r + 1) * numRad + iNext;
      const idx3 = (r + 1) * numRad + i;

      // Cockpit windows band at ring 1-2 upper
      // Segments are centred on angles 36*i+18 deg; {8,9,0,1} is symmetric about the top (y+) of the fuselage
      const isCockpit = r === 1 && (i === 8 || i === 9 || i === 0 || i === 1);
      // Aerodynamic vibrant blue cheatline along window level
      // Segments 2 and 7 are the mirror pair centred on +Z and -Z (the sides of the fuselage)
      const isCheatline = (i === 2 || i === 7) && r >= 2 && r <= 8;
      const isBelly = i >= 4 && i <= 6;

      let baseColor = '#ffffff';
      if (isCockpit) {
        baseColor = '#0f172a';
      } else if (isCheatline) {
        baseColor = '#0284c7';
      } else if (isBelly) {
        baseColor = '#94a3b8';
      }

      faces.push({
        indices: [idx0, idx1, idx2, idx3],
        baseColor,
        isCanopy: isCockpit,
        chordFraction: r / numRings,
      });
    }
  }

  // Supercritical Swept Wings with Dynamic Upward Aeroelastic Wing Flex
  const wingRootIdx = vertices.length;

  // Right Wing Stations (Root, Mid, Flexed Raked Tip)
  vertices.push(
    { x: -0.6, y: -0.25, z: -1.1 },
    { x: 2.6 + flapAft, y: -0.25 - flapDrop, z: -1.1 },
    { x: 1.0, y: 0.15 + tipFlexY * 0.35, z: -4.2 },
    { x: 2.8 + flapAft * 0.7, y: 0.15 - flapDrop * 0.7 + tipFlexY * 0.35, z: -4.2 },
    { x: 2.6, y: 0.75 + tipFlexY, z: -7.4 },
    { x: 3.5, y: 0.75 + tipFlexY, z: -7.5 }
  );

  // Left Wing Stations (Root, Mid, Flexed Raked Tip)
  vertices.push(
    { x: -0.6, y: -0.25, z: 1.1 },
    { x: 2.6 + flapAft, y: -0.25 - flapDrop, z: 1.1 },
    { x: 1.0, y: 0.15 + tipFlexY * 0.35, z: 4.2 },
    { x: 2.8 + flapAft * 0.7, y: 0.15 - flapDrop * 0.7 + tipFlexY * 0.35, z: 4.2 },
    { x: 2.6, y: 0.75 + tipFlexY, z: 7.4 },
    { x: 3.5, y: 0.75 + tipFlexY, z: 7.5 }
  );

  // Right Wing Inboard & Outboard Panels (Aeronautical sky blue & silver)
  faces.push(
    { indices: [wingRootIdx, wingRootIdx + 2, wingRootIdx + 3, wingRootIdx + 1], surface: 'upper', baseColor: '#38bdf8', isWing: true, isFlap: flapDeg > 0, chordFraction: 0.4 },
    { indices: [wingRootIdx + 1, wingRootIdx + 3, wingRootIdx + 2, wingRootIdx], surface: 'lower', baseColor: '#0369a1', isWing: true, isFlap: flapDeg > 0, chordFraction: 0.4 },
    { indices: [wingRootIdx + 2, wingRootIdx + 4, wingRootIdx + 5, wingRootIdx + 3], surface: 'upper', baseColor: '#0ea5e9', isWing: true, chordFraction: 0.6 },
    { indices: [wingRootIdx + 3, wingRootIdx + 5, wingRootIdx + 4, wingRootIdx + 2], surface: 'lower', baseColor: '#0284c7', isWing: true, chordFraction: 0.6 }
  );

  // Left Wing Inboard & Outboard Panels
  const lw = wingRootIdx + 6;
  faces.push(
    { indices: [lw, lw + 1, lw + 3, lw + 2], surface: 'upper', baseColor: '#38bdf8', isWing: true, isFlap: flapDeg > 0, chordFraction: 0.4 },
    { indices: [lw + 2, lw + 3, lw + 1, lw], surface: 'lower', baseColor: '#0369a1', isWing: true, isFlap: flapDeg > 0, chordFraction: 0.4 },
    { indices: [lw + 2, lw + 3, lw + 5, lw + 4], surface: 'upper', baseColor: '#0ea5e9', isWing: true, chordFraction: 0.6 },
    { indices: [lw + 4, lw + 5, lw + 3, lw + 2], surface: 'lower', baseColor: '#0284c7', isWing: true, chordFraction: 0.6 }
  );

  // GEnx High-Bypass Turbofans with Dreamliner Blue Cowlings
  const engIdx = vertices.length;
  // Right Engine
  vertices.push(
    { x: 0.2, y: -1.05, z: -3.0 },
    { x: 0.2, y: -1.55, z: -3.0 },
    { x: 0.2, y: -1.30, z: -3.3 },
    { x: 0.2, y: -1.30, z: -2.7 },
    { x: 2.2, y: -1.05, z: -3.0 },
    { x: 2.2, y: -1.55, z: -3.0 },
    { x: 2.2, y: -1.30, z: -3.25 },
    { x: 2.2, y: -1.30, z: -2.75 }
  );

  // Left Engine
  vertices.push(
    { x: 0.2, y: -1.05, z: 3.0 },
    { x: 0.2, y: -1.55, z: 3.0 },
    { x: 0.2, y: -1.30, z: 3.3 },
    { x: 0.2, y: -1.30, z: 2.7 },
    { x: 2.2, y: -1.05, z: 3.0 },
    { x: 2.2, y: -1.55, z: 3.0 },
    { x: 2.2, y: -1.30, z: 3.25 },
    { x: 2.2, y: -1.30, z: 2.75 }
  );

  // Engine Nacelle Faces (Boeing Azure Blue & Titanium Cowl)
  faces.push(
    { indices: [engIdx, engIdx + 2, engIdx + 6, engIdx + 4], baseColor: '#0284c7', isEngine: true },
    { indices: [engIdx + 2, engIdx + 1, engIdx + 5, engIdx + 6], baseColor: '#0369a1', isEngine: true },
    { indices: [engIdx + 1, engIdx + 3, engIdx + 7, engIdx + 5], baseColor: '#0369a1', isEngine: true },
    { indices: [engIdx + 3, engIdx, engIdx + 4, engIdx + 7], baseColor: '#0284c7', isEngine: true },
    { indices: [engIdx + 8, engIdx + 12, engIdx + 14, engIdx + 10], baseColor: '#0284c7', isEngine: true },
    { indices: [engIdx + 10, engIdx + 14, engIdx + 13, engIdx + 9], baseColor: '#0369a1', isEngine: true },
    { indices: [engIdx + 9, engIdx + 13, engIdx + 15, engIdx + 11], baseColor: '#0369a1', isEngine: true },
    { indices: [engIdx + 11, engIdx + 15, engIdx + 12, engIdx + 8], baseColor: '#0284c7', isEngine: true }
  );

  // Pylons: tie each nacelle to the wing underside (previously the engines floated ~1.2 units below the wing).
  // The wing underside height is interpolated bilinearly from the (flexed) inboard wing panel vertices.
  const wingUnderY = (x: number, zAbs: number): number => {
    const rLE = vertices[wingRootIdx], rTE = vertices[wingRootIdx + 1];
    const mLE = vertices[wingRootIdx + 2], mTE = vertices[wingRootIdx + 3];
    const t = (zAbs - Math.abs(rLE.z)) / (Math.abs(mLE.z) - Math.abs(rLE.z));
    const xLE = rLE.x + t * (mLE.x - rLE.x), xTE = rTE.x + t * (mTE.x - rTE.x);
    const yLE = rLE.y + t * (mLE.y - rLE.y), yTE = rTE.y + t * (mTE.y - rTE.y);
    const s = Math.max(0, Math.min(1, (x - xLE) / (xTE - xLE)));
    return yLE + s * (yTE - yLE);
  };
  const pylonX0 = 0.55, pylonX1 = 2.0;
  for (const sgn of [-1, 1]) {
    const zc = 3.0 * sgn;
    const base = vertices.length;
    vertices.push(
      { x: pylonX0, y: wingUnderY(pylonX0, 3.0), z: zc },
      { x: pylonX1, y: wingUnderY(pylonX1, 3.0), z: zc },
      { x: pylonX1, y: -1.05, z: zc },
      { x: pylonX0, y: -1.05, z: zc }
    );
    faces.push(
      { indices: [base, base + 1, base + 2, base + 3], baseColor: '#94a3b8', isEngine: true },
      { indices: [base + 3, base + 2, base + 1, base], baseColor: '#64748b', isEngine: true }
    );
  }

  // Empennage: Swept Vertical Fin (Airline Blue) & Horizontal Stabilizers
  const tailIdx = vertices.length;
  vertices.push(
    { x: 3.6, y: 0.8, z: 0.0 },
    { x: 5.2, y: 3.5, z: 0.0 },
    { x: 5.8, y: 3.5, z: 0.0 },
    { x: 5.8, y: 0.5, z: 0.0 },
    { x: 4.6, y: 0.35, z: -3.2 },
    { x: 5.5, y: 0.35, z: -3.1 },
    { x: 4.6, y: 0.35, z: 3.2 },
    { x: 5.5, y: 0.35, z: 3.1 }
  );

  faces.push(
    { indices: [tailIdx, tailIdx + 1, tailIdx + 2, tailIdx + 3], baseColor: '#0284c7' },
    { indices: [tailIdx + 3, tailIdx + 2, tailIdx + 1, tailIdx], baseColor: '#0369a1' },
    { indices: [tailIdx, tailIdx + 4, tailIdx + 5, tailIdx + 3], surface: 'upper', baseColor: '#38bdf8', isWing: true, isStab: true },
    { indices: [tailIdx + 3, tailIdx + 5, tailIdx + 4, tailIdx], surface: 'lower', baseColor: '#0369a1', isWing: true, isStab: true },
    { indices: [tailIdx, tailIdx + 6, tailIdx + 7, tailIdx + 3], surface: 'upper', baseColor: '#38bdf8', isWing: true, isStab: true },
    { indices: [tailIdx + 3, tailIdx + 7, tailIdx + 6, tailIdx], surface: 'lower', baseColor: '#0369a1', isWing: true, isStab: true }
  );

  return orientLiftingSurfaces({ vertices, faces, name: 'Boeing 787 Dreamliner' });
}

/**
 * 3. Concorde SST Supersonic Airliner (Blender CAD Quality & Fully Dynamic)
 * Dynamic features:
 * - Dynamic droop-nose: Visor tilts down automatically for approach/low speed
 * - Ogival gothic delta wing with complex double curvature
 * - Rolls-Royce Olympus 593 turbojets with reheat afterburner glow
 * - Vibrant supersonic livery: Brilliant aerowhite, royal supersonic blue fin
 */
function createConcordeGeometry(aoaDeg = 0, airspeedKts = 1050): Aircraft3DMeshData {
  // Concorde Droop Nose: drops 5 deg for low speed / high alpha (airspeed < 280 kts or AoA > 8 deg).
  // Rotation convention below: a POSITIVE angle moves points ahead of the hinge (dx < 0) DOWN.
  const isDroop = airspeedKts < 280 || aoaDeg > 8;
  const droopRad = isDroop ? (5 * Math.PI) / 180 : 0;
  const cosD = Math.cos(droopRad);
  const sinD = Math.sin(droopRad);

  const rotateDroop = (p: Vertex3D): Vertex3D => {
    const dx = p.x - (-4.2);
    const dy = p.y - 0.0;
    return {
      x: -4.2 + (dx * cosD - dy * sinD),
      y: 0.0 + (dx * sinD + dy * cosD),
      z: p.z,
    };
  };

  const nose0 = rotateDroop({ x: -8.8, y: -0.22, z: 0.0 });
  const nose1 = rotateDroop({ x: -6.8, y: 0.08, z: 0.0 });
  const nose2 = rotateDroop({ x: -6.8, y: -0.28, z: 0.0 });
  const nose3 = rotateDroop({ x: -6.8, y: -0.08, z: -0.52 });
  const nose4 = rotateDroop({ x: -6.8, y: -0.08, z: 0.52 });

  const vertices: Vertex3D[] = [
    // Dynamic Needle Droop Nose & Visor (0 - 5)
    nose0, nose1, nose2, nose3, nose4,
    { x: -4.2, y: 0.52, z: 0.0 },     // 5: Cockpit visor apex

    // Slender Fuselage (6 - 13)
    { x: -4.2, y: 0.0, z: -0.72 },    // 6: Cockpit flank R
    { x: -4.2, y: 0.0, z: 0.72 },     // 7: Cockpit flank L
    { x: 0.0, y: 0.62, z: 0.0 },      // 8: Mid roof
    { x: 0.0, y: -0.62, z: 0.0 },     // 9: Mid belly
    { x: 0.0, y: 0.0, z: -0.85 },     // 10: Mid flank R
    { x: 0.0, y: 0.0, z: 0.85 },      // 11: Mid flank L
    { x: 4.8, y: 0.48, z: 0.0 },      // 12: Tailcone top
    { x: 4.8, y: -0.48, z: 0.0 },     // 13: Tailcone bottom

    // Ogival Gothic Delta Wing (Complex double-curvature sweep) (14 - 23)
    { x: -4.6, y: 0.02, z: -0.68 },   // 14: Wing apex R
    { x: -1.2, y: -0.02, z: -2.8 },   // 15: Ogive inflection R
    { x: 1.5, y: -0.04, z: -4.6 },    // 16: Mid-span R
    { x: 3.8, y: -0.04, z: -5.0 },    // 17: Wingtip R
    { x: 5.0, y: 0.02, z: -1.0 },     // 18: Trailing edge root R
    { x: -4.6, y: 0.02, z: 0.68 },    // 19: Wing apex L
    { x: -1.2, y: -0.02, z: 2.8 },    // 20: Ogive inflection L
    { x: 1.5, y: -0.04, z: 4.6 },     // 21: Mid-span L
    { x: 3.8, y: -0.04, z: 5.0 },     // 22: Wingtip L
    { x: 5.0, y: 0.02, z: 1.0 },      // 23: Trailing edge root L

    // Rolls-Royce Olympus Engine Nacelle Boxes (24 - 31)
    { x: 1.8, y: -0.88, z: -2.3 },    // 24: Intake lip R outer
    { x: 1.8, y: -0.88, z: -1.4 },    // 25: Intake lip R inner
    { x: 4.8, y: -0.88, z: -2.3 },    // 26: Nozzle R outer
    { x: 4.8, y: -0.88, z: -1.4 },    // 27: Nozzle R inner
    { x: 1.8, y: -0.88, z: 2.3 },     // 28: Intake lip L outer
    { x: 1.8, y: -0.88, z: 1.4 },     // 29: Intake lip L inner
    { x: 4.8, y: -0.88, z: 2.3 },     // 30: Nozzle L outer
    { x: 4.8, y: -0.88, z: 1.4 },     // 31: Nozzle L inner

    // Swept Vertical Stabilizer (32 - 34)
    { x: 2.8, y: 0.58, z: 0.0 },      // 32: Fin root lead
    { x: 5.2, y: 3.9, z: 0.0 },       // 33: Fin tip
    { x: 5.8, y: 0.25, z: 0.0 },      // 34: Fin trailing base

    // Nacelle tops, flush with the wing underside (35 - 42) - gives the engine boxes real volume
    { x: 1.8, y: -0.03, z: -2.3 },    // 35: R front outer top
    { x: 1.8, y: -0.03, z: -1.4 },    // 36: R front inner top
    { x: 4.8, y: -0.03, z: -2.3 },    // 37: R rear outer top
    { x: 4.8, y: -0.03, z: -1.4 },    // 38: R rear inner top
    { x: 1.8, y: -0.03, z: 2.3 },     // 39: L front outer top
    { x: 1.8, y: -0.03, z: 1.4 },     // 40: L front inner top
    { x: 4.8, y: -0.03, z: 2.3 },     // 41: L rear outer top
    { x: 4.8, y: -0.03, z: 1.4 },     // 42: L rear inner top
  ];

  const faces: Face3D[] = [
    // Droop Nose Radome (Brilliant Supersonic White)
    { indices: [0, 1, 3], baseColor: '#ffffff', chordFraction: 0.05 },
    { indices: [0, 4, 1], baseColor: '#ffffff', chordFraction: 0.05 },
    { indices: [0, 3, 2], baseColor: '#e2e8f0', chordFraction: 0.05 },
    { indices: [0, 2, 4], baseColor: '#e2e8f0', chordFraction: 0.05 },

    // Cockpit Visor & Window Panel (Tinted Aerospace Royal Cyan)
    { indices: [1, 5, 6, 3], baseColor: '#0284c7', isCanopy: true, chordFraction: 0.15 },
    { indices: [1, 4, 7, 5], baseColor: '#0369a1', isCanopy: true, chordFraction: 0.15 },
    { indices: [2, 3, 6, 9], baseColor: '#e2e8f0', chordFraction: 0.15 },
    { indices: [2, 9, 7, 4], baseColor: '#e2e8f0', chordFraction: 0.15 },

    // Slender Fuselage Tube
    { indices: [5, 8, 10, 6], baseColor: '#ffffff', chordFraction: 0.35 },
    { indices: [5, 7, 11, 8], baseColor: '#ffffff', chordFraction: 0.35 },
    { indices: [8, 12, 10], baseColor: '#ffffff', chordFraction: 0.65 },
    { indices: [8, 11, 12], baseColor: '#ffffff', chordFraction: 0.65 },
    { indices: [9, 10, 13], baseColor: '#e2e8f0', chordFraction: 0.65 },
    { indices: [9, 13, 11], baseColor: '#e2e8f0', chordFraction: 0.65 },

    // Right Gothic Ogive Delta Wing (Double Curvature in Brilliant White & Aeroblue)
    { indices: [14, 15, 16, 17, 18, 10], surface: 'upper', baseColor: '#38bdf8', isWing: true, chordFraction: 0.5 },
    { indices: [14, 10, 18, 17, 16, 15], surface: 'lower', baseColor: '#0284c7', isWing: true, chordFraction: 0.5 },

    // Left Gothic Ogive Delta Wing
    { indices: [19, 11, 23, 22, 21, 20], surface: 'upper', baseColor: '#38bdf8', isWing: true, chordFraction: 0.5 },
    { indices: [19, 20, 21, 22, 23, 11], surface: 'lower', baseColor: '#0284c7', isWing: true, chordFraction: 0.5 },

    // Swept Vertical Fin with Royal Supersonic Blue
    { indices: [32, 33, 34], baseColor: '#1d4ed8', chordFraction: 0.8 },
    { indices: [32, 34, 33], baseColor: '#2563eb', chordFraction: 0.8 },

  ];

  // Underslung Olympus engine pods: closed boxes (bottom, 2 sides, intake, nozzle)
  addNacelleBox(vertices, faces, [24, 25, 26, 27], [35, 36, 37, 38], '#334155');
  addNacelleBox(vertices, faces, [28, 29, 30, 31], [39, 40, 41, 42], '#334155');

  const exhaustPoints = [
    { x: 4.9, y: -0.88, z: -1.85 },
    { x: 4.9, y: -0.88, z: 1.85 },
  ];

  return orientLiftingSurfaces({ vertices, faces, name: 'Concorde SST (Mach 2.0 Supersonic Airliner)', exhaustPoints });
}

/**
 * 4. NACA 2412 / 0012 3D Aerodynamic Wing Section (Blender CAD Quality)
 * High-definition 3D airfoil with authentic camber curvature, leading-edge
 * radius, and knife trailing edge in vibrant aeronautical sapphire/cyan.
 */
function createAirfoilWingGeometry(camber = 0.02, thickness = 0.12, flapDeg = 0): Aircraft3DMeshData {
  const vertices: Vertex3D[] = [];
  const faces: Face3D[] = [];

  const numRibs = 8;
  const span = 8.6;
  const numPts = 24;
  const SCALE = 5.8;
  const P = 0.4; // location of max camber
  const HINGE = 0.7; // flap hinge, fraction of chord (matches the 2D profile)

  const camberAt = (xc: number) =>
    camber > 0
      ? xc < P
        ? (camber / (P * P)) * (2 * P * xc - xc * xc)
        : (camber / Math.pow(1 - P, 2)) * ((1 - 2 * P) + 2 * P * xc - xc * xc)
      : 0;
  const flapRad = (Math.max(0, flapDeg) * Math.PI) / 180;
  const yHinge = camberAt(HINGE);

  const profile2D: { x: number; y: number }[] = [];
  const profileXc: number[] = []; // undeflected chord fraction, 0 = leading edge, 1 = trailing edge
  for (let i = 0; i < numPts; i++) {
    const angle = (2 * Math.PI * i) / numPts;
    const xc = 0.5 * (1 - Math.cos(angle));
    const yt = 5 * thickness * (
      0.2969 * Math.sqrt(Math.max(0.0005, xc)) -
      0.1260 * xc -
      0.3516 * xc * xc +
      0.2843 * Math.pow(xc, 3) -
      0.1015 * Math.pow(xc, 4)
    );

    // i = 0 is the leading edge, i = numPts/2 the trailing edge; first half is the upper skin
    let xn = xc;
    let yn = angle <= Math.PI ? camberAt(xc) + yt : camberAt(xc) - yt;

    // Trailing-edge flap: rotate everything aft of the hinge about (HINGE, yHinge), positive = TE down
    if (flapRad > 0 && xc > HINGE) {
      const dx = xc - HINGE;
      const dy = yn - yHinge;
      xn = HINGE + dx * Math.cos(flapRad) + dy * Math.sin(flapRad);
      yn = yHinge - dx * Math.sin(flapRad) + dy * Math.cos(flapRad);
    }

    profile2D.push({ x: (xn - 0.25) * SCALE, y: yn * SCALE });
    profileXc.push(xc);
  }

  // Extrude along Z (spanwise)
  for (let r = 0; r < numRibs; r++) {
    const z = -span / 2 + (r / (numRibs - 1)) * span;
    for (const pt of profile2D) {
      vertices.push({ x: pt.x, y: pt.y, z });
    }
  }

  // Skin quads. Vertex order is chosen so normals point OUT of the wing
  // (upper skin -> +Y, lower skin -> -Y); the renderer's suction/compression colouring depends on it.
  for (let r = 0; r < numRibs - 1; r++) {
    for (let i = 0; i < numPts; i++) {
      const iNext = (i + 1) % numPts;
      const idx0 = r * numPts + i;
      const idx1 = r * numPts + iNext;
      const idx2 = (r + 1) * numPts + iNext;
      const idx3 = (r + 1) * numPts + i;

      const isUpper = i < numPts / 2;
      const baseColor = isUpper ? '#0284c7' : '#0369a1';
      // 0 at the leading edge, 1 at the trailing edge (was inverted: LE reported 1.0)
      const chordFraction = (profileXc[i] + profileXc[iNext]) / 2;

      faces.push({
        indices: [idx0, idx3, idx2, idx1],
        baseColor,
        isWing: true,
        isFlap: flapRad > 0 && chordFraction > HINGE,
        surface: isUpper ? 'upper' : 'lower',
        chordFraction,
      });
    }
  }

  // End caps in polished aluminum (outward normals: -Z at rib 0, +Z at the last rib)
  const leftCapIndices: number[] = [];
  const rightCapIndices: number[] = [];
  for (let i = 0; i < numPts; i++) {
    leftCapIndices.push(i);
    rightCapIndices.push((numRibs - 1) * numPts + i);
  }
  const leftCap: Face3D = { indices: leftCapIndices, baseColor: '#38bdf8', isWing: true };
  const rightCap: Face3D = { indices: rightCapIndices, baseColor: '#38bdf8', isWing: true };
  orientOutward(vertices, leftCap, { x: 0, y: 0, z: 0 });
  orientOutward(vertices, rightCap, { x: 0, y: 0, z: 0 });
  faces.push(leftCap, rightCap);

  return orientLiftingSurfaces({ vertices, faces, name: camber > 0 ? 'NACA 2412 Airfoil Wing' : 'NACA 0012 Symmetric Wing' });
}

/**
 * 5. Precision 3D Cylinder (Bluff Body) in Cobalt Steel
 */
function createCylinder3DGeometry(): Aircraft3DMeshData {
  const vertices: Vertex3D[] = [];
  const faces: Face3D[] = [];

  const numRad = 24;
  const radius = 1.4;
  const height = 7.6;

  // Bottom circle
  for (let i = 0; i < numRad; i++) {
    const angle = (2 * Math.PI * i) / numRad;
    vertices.push({ x: Math.cos(angle) * radius, y: -height / 2, z: Math.sin(angle) * radius });
  }

  // Top circle
  for (let i = 0; i < numRad; i++) {
    const angle = (2 * Math.PI * i) / numRad;
    vertices.push({ x: Math.cos(angle) * radius, y: height / 2, z: Math.sin(angle) * radius });
  }

  // Side faces in rich cobalt and slate (winding gives OUTWARD normals; it was inward before, which put the
  // renderer's "stagnation" face on the lee side of the cylinder)
  for (let i = 0; i < numRad; i++) {
    const iNext = (i + 1) % numRad;
    faces.push({
      indices: [i, numRad + i, numRad + iNext, iNext],
      baseColor: i % 2 === 0 ? '#2563eb' : '#1d4ed8',
      chordFraction: (i / numRad),
    });
  }

  // End caps (the cylinder was open and see-through)
  const bottomCap: Face3D = { indices: Array.from({ length: numRad }, (_, i) => i), baseColor: '#334155' };
  const topCap: Face3D = { indices: Array.from({ length: numRad }, (_, i) => numRad + i), baseColor: '#334155' };
  orientOutward(vertices, bottomCap, { x: 0, y: 0, z: 0 });
  orientOutward(vertices, topCap, { x: 0, y: 0, z: 0 });
  faces.push(bottomCap, topCap);

  return { vertices, faces, name: 'Cylinder (Bluff Body Flow)' };
}

export function getAircraft3DModel(
  type: AircraftModelType, 
  flapDeg = 0, 
  aoaDeg = 0, 
  airspeedKts = 350, 
  liftForceN = 0
): Aircraft3DMeshData {
  switch (type) {
    case 'f22':
      return createF22Geometry(aoaDeg, airspeedKts);
    case 'airliner':
      return createAirlinerGeometry(flapDeg, airspeedKts, liftForceN);
    case 'concorde':
      return createConcordeGeometry(aoaDeg, airspeedKts);
    case 'naca2412':
      return createAirfoilWingGeometry(0.02, 0.12, flapDeg);
    case 'naca0012':
      return createAirfoilWingGeometry(0.0, 0.12, flapDeg);
    case 'cylinder':
      return createCylinder3DGeometry();
    default:
      return createF22Geometry(aoaDeg, airspeedKts);
  }
}