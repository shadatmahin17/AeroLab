import { AircraftModelType, AeroTelemetry } from '../types/aerodynamics';
import { Vertex3D } from '../utils/aircraft3DGeometry';

export interface Fluid3DParams {
  modelType: AircraftModelType;
  aoaDeg: number;
  airspeed_kts: number;
  mach: number;
  altitude_ft: number;
  flapsDeg: number;
  isStalled: boolean;
  cl: number;
  cd: number;
  timeSec?: number;
}

export interface Velocity3DResult {
  u: number; // downstream (+X)
  v: number; // vertical (+Y)
  w: number; // spanwise (+Z)
  speed: number;
  pressureCoeff: number; // Cp
  isSeparated: boolean;
}

/**
 * 3D Aerodynamic Fluid Dynamics Engine
 *
 * Implements potential flow with boundary displacement, Kutta circulation,
 * Prandtl downwash, Lamb-Oseen wingtip vortices, Bernoulli pressure gradients,
 * and boundary layer separation with turbulent wake shedding.
 */
export class FluidDynamics3D {
  /**
   * Evaluates the local 3D fluid velocity vector (u, v, w) at point (x, y, z)
   * in the wind tunnel coordinate system:
   *   - X: along wind tunnel flow (-X is upstream inlet, +X is downstream outlet)
   *   - Y: vertical height (+Y is up towards ceiling, -Y is down towards floor)
   *   - Z: spanwise lateral (-Z is starboard/right, +Z is port/left)
   */
  public static getVelocity(
    p: Vertex3D,
    params: Fluid3DParams
  ): Velocity3DResult {
    const {
      modelType,
      aoaDeg,
      airspeed_kts,
      flapsDeg,
      isStalled,
      cl,
      timeSec = 0,
    } = params;

    // Free-stream speed normalized to wind tunnel simulation scale (1.0 = nominal)
    const vInf = Math.max(0.4, (airspeed_kts / 350) * 1.2);
    const aoaRad = (aoaDeg * Math.PI) / 180;
    const sinA = Math.sin(aoaRad);
    const cosA = Math.cos(aoaRad);

    // Initial uniform free-stream flow along +X
    let u = vInf;
    let v = 0;
    let w = 0;

    // Relative coordinates in body reference frame (pitch rotated around origin)
    // Model pitched nose-up: Nose (x < 0) rotates to +Y, tail (x > 0) rotates to -Y
    const bx = p.x * cosA + p.y * sinA;
    const by = -p.x * sinA + p.y * cosA;
    const bz = p.z;

    let isSeparated = false;
    let cp = 0;

    // -------------------------------------------------------------------------
    // 1. MODEL-SPECIFIC 3D GEOMETRY & BOUNDARY DISPLACEMENT FIELD
    // -------------------------------------------------------------------------
    if (modelType === 'cylinder') {
      // 3D Circular cylinder along Z-axis (cross-flow)
      // Radius R = 1.8, centered at origin
      const R = 1.8;
      const rSq = p.x * p.x + p.y * p.y;
      const r = Math.sqrt(rSq);

      if (r > 0.05) {
        // 2D Potential flow doublet past circular cylinder
        const factor = (R * R) / Math.max(R * R * 0.9, rSq);
        const cos2th = (p.x * p.x - p.y * p.y) / rSq;
        const sin2th = (2 * p.x * p.y) / rSq;

        u = vInf * (1 - factor * cos2th);
        v = -vInf * factor * sin2th;

        // Inside or at solid boundary: push out along radial normal
        if (r < R * 1.08) {
          const push = (R * 1.08 - r) * 2.5;
          u += (p.x / r) * push;
          v += (p.y / r) * push;
        }

        // Unsteady von Kármán vortex street shedding downstream (x > R)
        if (p.x > R * 0.8) {
          const strouhalFreq = 1.8 * vInf;
          const wakePhase = p.x * 1.2 - timeSec * strouhalFreq;
          const wakeDecay = Math.exp(-Math.abs(p.y) / 2.2) * Math.min(1.0, (p.x - R) / 2.0);
          const vortexSwirl = Math.sin(wakePhase) * vInf * 0.7 * wakeDecay;
          v += vortexSwirl;
          u -= Math.abs(vortexSwirl) * 0.45; // Viscous wake velocity deficit
          isSeparated = true;
        }
      }
    } else {
      // WINGED AIRCRAFT MODELS (F-22, Airliner B787, Concorde, NACA Airfoils)

      // Geometry characteristics by model
      let halfSpan = 6.8;
      let rootChord = 8.0;
      let noseX = -6.8;
      let tailX = 6.2;
      let fusRadius = 1.2;
      let sweepDeg = 42;
      let camberPeak = 0.0;

      if (modelType === 'f22') {
        halfSpan = 6.8;
        rootChord = 8.5;
        noseX = -6.8;
        tailX = 6.5;
        fusRadius = 1.1;
        sweepDeg = 42;
        camberPeak = 0.04;
      } else if (modelType === 'airliner') {
        halfSpan = 9.2;
        rootChord = 7.5;
        noseX = -7.5;
        tailX = 7.2;
        fusRadius = 1.7;
        sweepDeg = 32;
        camberPeak = 0.28 + (flapsDeg / 40) * 0.35; // Fowler flap camber increase
      } else if (modelType === 'concorde') {
        halfSpan = 4.8;
        rootChord = 12.0;
        noseX = -9.2;
        tailX = 6.5;
        fusRadius = 0.95;
        sweepDeg = 68; // Slender ogival delta
        camberPeak = 0.02;
      } else if (modelType === 'naca2412') {
        halfSpan = 7.0;
        rootChord = 6.5;
        noseX = -3.25;
        tailX = 3.25;
        fusRadius = 0.05;
        sweepDeg = 0;
        camberPeak = 0.22 + (flapsDeg / 40) * 0.25;
      } else if (modelType === 'naca0012') {
        halfSpan = 7.0;
        rootChord = 6.5;
        noseX = -3.25;
        tailX = 3.25;
        fusRadius = 0.05;
        sweepDeg = 0;
        camberPeak = (flapsDeg / 40) * 0.22;
      }

      // --- A. FUSELAGE DISPLACEMENT (Slender Body of Revolution) ---
      if (fusRadius > 0.1 && bx >= noseX && bx <= tailX) {
        const fusFrac = (bx - noseX) / (tailX - noseX);
        const localFusR = fusRadius * Math.sin(fusFrac * Math.PI) * 1.1;
        const rTrans = Math.hypot(by, bz);

        if (rTrans > 0.01 && rTrans < localFusR * 2.8) {
          const disp = Math.pow(localFusR / Math.max(localFusR * 0.6, rTrans), 2) * 0.35 * vInf;
          const vyLocal = (by / rTrans) * disp;
          const vzLocal = (bz / rTrans) * disp;
          // Transform back to tunnel coordinates
          v += vyLocal * cosA;
          u -= vyLocal * sinA;
          w += vzLocal;
        }

        // Inside fuselage solid hull -> push outward
        if (rTrans < localFusR * 1.05) {
          const push = (localFusR * 1.05 - rTrans) * 3.0;
          v += (by / (rTrans || 1)) * push * cosA;
          w += (bz / (rTrans || 1)) * push;
        }
      }

      // --- B. WING LIFT, BERNOULLI ACCELERATION & DEFLECTION ---
      // Wing bounds along span:
      const absZ = Math.abs(bz);
      if (absZ <= halfSpan * 1.05) {
        const spanFrac = absZ / halfSpan;
        // Wing chord and leading edge position at this span station
        const sweepOffset = Math.tan((sweepDeg * Math.PI) / 180) * absZ * 0.55;
        const localLeX = (modelType.startsWith('naca') ? noseX : -1.8) + sweepOffset;
        const localTeX = (modelType.startsWith('naca') ? tailX : 4.5) + sweepOffset * 0.3;
        const localChord = Math.max(0.8, localTeX - localLeX);

        if (bx >= localLeX - 2.5 && bx <= localTeX + 8.0) {
          // Chordwise fraction (0 = leading edge, 1 = trailing edge)
          const chordFrac = (bx - localLeX) / localChord;

          // Wing thickness distribution (NACA-like envelope)
          let tHalf = 0.35 * (1 - spanFrac * 0.45);
          if (modelType === 'concorde' || modelType === 'f22') tHalf *= 0.65; // razor thin supersonic delta

          // 1. Upwash ahead of wing leading edge (induced by circulation)
          if (chordFrac < 0 && chordFrac > -0.6) {
            const upwashStrength = Math.max(0.1, cl) * vInf * 0.35 * (1 - spanFrac * 0.3);
            v += upwashStrength * (1 + chordFrac / 0.6) * cosA;
          }

          // 2. Over the wing surface: flow deflection & Bernoulli acceleration
          if (chordFrac >= 0 && chordFrac <= 1.0) {
            const wingY_camber = (camberPeak * Math.sin(chordFrac * Math.PI) - sinA * (bx - localLeX) * 0.5);
            const distFromWing = Math.abs(by - wingY_camber);

            if (distFromWing < 2.5) {
              const proximity = Math.exp(-distFromWing / 0.85);

              if (by >= wingY_camber) {
                // UPPER SUCTION SURFACE:
                if (!isStalled || chordFrac < 0.28) {
                  // Attached laminar flow: Bernoulli acceleration
                  const suctionPeak = (Math.max(0.2, cl) * 0.65) / Math.sqrt(Math.max(0.08, chordFrac));
                  const accel = Math.min(1.2 * vInf, suctionPeak * vInf * proximity);
                  u += accel;
                  // Flow conforms to upper convex contour (pulled towards surface)
                  const contourSlope = -Math.cos(chordFrac * Math.PI) * 0.4;
                  v += contourSlope * vInf * proximity * 0.6;
                } else {
                  // STALL: Flow separation over upper aft surface!
                  isSeparated = true;
                  const stallPhase = timeSec * 6.0 + bx * 2.0;
                  const eddy = Math.sin(stallPhase) * vInf * 0.65;
                  u -= Math.abs(eddy) * 0.7; // Velocity deficit / reverse flow
                  v += eddy * 0.8; // Vertical buffeting
                  w += Math.cos(stallPhase * 0.8) * vInf * 0.35; // Spanwise turbulence
                }
              } else {
                // LOWER COMPRESSION SURFACE:
                const compression = Math.max(0, cl) * 0.25 * vInf * proximity;
                u -= compression; // Flow slows down slightly
                v -= 0.2 * vInf * proximity; // Deflected downwards
              }

              // Solid wing penetration avoidance:
              if (distFromWing < tHalf) {
                const pushY = (tHalf - distFromWing) * 3.5;
                v += (by >= wingY_camber ? pushY : -pushY) * cosA;
              }
            }
          }

          // 3. Aft of trailing edge: Downwash field (Prandtl lifting line)
          if (chordFrac > 1.0) {
            const aftDist = bx - localTeX;
            const downwashAngle = (2.2 * Math.max(0.1, cl)) / (Math.PI * (halfSpan * 2 / rootChord + 2.0));
            const downwashDecay = Math.exp(-aftDist / 12.0) * (1 - spanFrac * 0.3);
            const dw = Math.tan(downwashAngle) * vInf * downwashDecay * 1.8;
            v -= dw * cosA;

            // Flaps extra downwash jet
            if (flapsDeg > 0 && absZ < halfSpan * 0.65) {
              const flapDrop = (flapsDeg / 40) * 0.55 * vInf * Math.exp(-aftDist / 8.0);
              v -= flapDrop * cosA;
            }

            // Viscous wake deficit behind trailing edge
            const wakeDistY = Math.abs(by + (chordFrac - 1.0) * 0.2);
            if (wakeDistY < 0.85) {
              const deficit = 0.28 * vInf * Math.exp(-wakeDistY / 0.4) / Math.sqrt(Math.max(1, aftDist));
              u -= deficit;
            }
          }
        }

        // --- C. 3D WINGTIP VORTICES (Lamb-Oseen Helical Vortex System) ---
        // Vortices trail downstream from the left and right wingtips:
        const tipX0 = localLeX + (localTeX - localLeX) * 0.75;
        if (p.x >= tipX0 - 1.0) {
          const distFromTipZ = absZ - halfSpan;
          const vortexCoreY = 0.0 - (p.x - tipX0) * 0.08 * sinA;
          const rVortex = Math.hypot(distFromTipZ, p.y - vortexCoreY);

          if (rVortex < 3.2 && rVortex > 0.04) {
            const coreRadius = 0.35 + (p.x - tipX0) * 0.025; // Viscous core diffusion
            const gamma = Math.max(0.15, cl) * vInf * 1.8; // Vortex circulation strength
            // Lamb-Oseen tangential velocity profile
            const vTan = (gamma / (2 * Math.PI * rVortex)) * (1 - Math.exp(-(rVortex * rVortex) / (coreRadius * coreRadius)));

            const dy = p.y - vortexCoreY;
            const dz = distFromTipZ;

            // Port (left, +Z): counter-clockwise swirl
            // Starboard (right, -Z): clockwise swirl
            const swirlSign = bz > 0 ? 1 : -1;
            const vInducedY = swirlSign * (-dz / rVortex) * vTan;
            const vInducedZ = swirlSign * (dy / rVortex) * vTan;

            v += vInducedY;
            w += vInducedZ;
          }
        }

        // --- D. FOREBODY CHINE VORTICES (F-22 & Concorde Delta) ---
        if ((modelType === 'f22' || modelType === 'concorde') && aoaDeg > 4 && p.x > noseX + 1.5 && p.x < localTeX) {
          const chineCoreZ = 1.4 + (p.x - noseX) * 0.18;
          for (const sign of [-1, 1]) {
            const rChine = Math.hypot(p.z - sign * chineCoreZ, p.y - 0.4);
            if (rChine < 1.6 && rChine > 0.05) {
              const chineGamma = (aoaDeg / 20) * vInf * 0.9;
              const chineVTan = (chineGamma / (2 * Math.PI * rChine)) * (1 - Math.exp(-(rChine * rChine) / 0.12));
              v += sign * ((p.z - sign * chineCoreZ) / rChine) * chineVTan;
              w += -sign * ((p.y - 0.4) / rChine) * chineVTan;
              u += chineVTan * 0.4; // Axial vortex core acceleration
            }
          }
        }

        // --- E. ENGINE INTAKE SUCTION & EXHAUST JET ---
        if (modelType === 'airliner') {
          // Underslung turbofan nacelles at z = ±3.5, y = -1.5, x = -0.5
          for (const nz of [-3.5, 3.5]) {
            const distNacelle = Math.hypot(p.z - nz, p.y + 1.5, p.x + 0.5);
            if (distNacelle < 1.8 && distNacelle > 0.05) {
              // Engine airflow acceleration through fan
              u += 0.35 * vInf * Math.exp(-distNacelle / 1.0);
            }
          }
        } else if (modelType === 'f22' && airspeed_kts >= 450) {
          // Supersonic afterburner exhaust jet behind twin nozzles (x > 6.5, z = ±0.7)
          if (p.x > 6.5) {
            for (const nz of [-0.67, 0.67]) {
              const rJet = Math.hypot(p.z - nz, p.y + 0.38);
              if (rJet < 1.2) {
                u += (airspeed_kts / 400) * 0.8 * vInf * Math.exp(-rJet / 0.6);
              }
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. LOCAL SPEED & PRESSURE COEFFICIENT (Cp = 1 - (V / V_inf)^2)
    // -------------------------------------------------------------------------
    const speed = Math.hypot(u, v, w);
    cp = 1 - Math.pow(speed / vInf, 2);
    cp = Math.max(-3.5, Math.min(1.0, cp));

    return { u, v, w, speed, pressureCoeff: cp, isSeparated };
  }

  /**
   * Numerically integrates a 3D streamline through the velocity field
   * using 2nd-order Runge-Kutta (RK2 / Midpoint Method).
   */
  public static traceStreamline(
    start: Vertex3D,
    params: Fluid3DParams,
    steps = 40,
    ds = 0.85
  ): (Vertex3D & { speed: number; pressureCoeff: number; isSeparated: boolean })[] {
    const points: (Vertex3D & { speed: number; pressureCoeff: number; isSeparated: boolean })[] = [];
    let cur: Vertex3D = { ...start };

    for (let i = 0; i < steps; i++) {
      const v1 = FluidDynamics3D.getVelocity(cur, params);
      points.push({
        x: cur.x,
        y: cur.y,
        z: cur.z,
        speed: v1.speed,
        pressureCoeff: v1.pressureCoeff,
        isSeparated: v1.isSeparated,
      });

      if (cur.x > 22 || Math.abs(cur.y) > 9 || Math.abs(cur.z) > 14) break;

      // RK2 midpoint evaluation
      const len1 = v1.speed || 1;
      const mid: Vertex3D = {
        x: cur.x + (v1.u / len1) * (ds * 0.5),
        y: cur.y + (v1.v / len1) * (ds * 0.5),
        z: cur.z + (v1.w / len1) * (ds * 0.5),
      };

      const v2 = FluidDynamics3D.getVelocity(mid, params);
      const len2 = v2.speed || 1;

      cur = {
        x: cur.x + (v2.u / len2) * ds,
        y: cur.y + (v2.v / len2) * ds,
        z: cur.z + (v2.w / len2) * ds,
      };
    }

    return points;
  }
}
