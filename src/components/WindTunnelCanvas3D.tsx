import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SimulationParams, AeroTelemetry } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import { getAircraft3DModel, computeFaceNormal, Vertex3D } from '../utils/aircraft3DGeometry';
import { windTunnelAudio } from '../utils/audio';
import { 
  RotateCw, 
  AlertTriangle, 
  Zap, 
  Volume2, 
  VolumeX, 
  ArrowUpRight,
  Flame,
  Activity,
  Compass,
  Play,
  Box
} from 'lucide-react';

interface WindTunnelCanvas3DProps {
  params: SimulationParams;
  onParamChange: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  telemetry: AeroTelemetry;
  isPaused: boolean;
  onFallbackTo2D?: () => void;
  onOpenWebGL?: () => void;
  onOpenModelInspector?: () => void;
}

interface CameraState {
  distance: number;
  theta: number; // Azimuth
  phi: number;   // Elevation
  target: Vertex3D;
}

interface Particle3D {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  color: string;
}

/**
 * Maps aerodynamic local pressure coefficient Cp to a scientific CFD colormap
 * (Royal Blue = Suction peak -> Cyan -> Emerald -> Amber -> Crimson Stagnation)
 */
function getCfdHeatmapColor(cp: number, isStalled: boolean): string {
  if (isStalled) return '#ef4444'; // Boundary layer turbulent separation
  // Clamp Cp to range -2.8 (extreme suction) to +1.0 (stagnation)
  const norm = Math.max(0, Math.min(1, (cp - (-2.8)) / 3.8));
  if (norm < 0.22) return '#0284c7'; // Deep Suction Royal Blue
  if (norm < 0.42) return '#00f0ff'; // Suction Peak Electric Cyan
  if (norm < 0.62) return '#10b981'; // Attached Laminar Emerald
  if (norm < 0.82) return '#f59e0b'; // Dynamic Compression Amber
  return '#ef4444'; // Dynamic Ram Stagnation Crimson
}

export const WindTunnelCanvas3D: React.FC<WindTunnelCanvas3DProps> = ({
  params,
  onParamChange,
  telemetry,
  isPaused,
  onOpenWebGL,
  onOpenModelInspector,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Spherical Camera (Distance, Azimuth, Elevation)
  const cameraStateRef = useRef<CameraState>({
    distance: 18,
    theta: 0.85,  // Azimuth (radians)
    phi: 0.38,    // Elevation (radians)
    target: { x: 0, y: 0, z: 0 },
  });

  // Dragging for 3D Camera Orbit or Pitch control
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const isShiftDragRef = useRef(false);

  // Cinematic 360 Auto-Orbit Mode
  const [isAutoOrbit, setIsAutoOrbit] = useState(false);

  // 3D Particles
  const particlesRef = useRef<Particle3D[]>([]);

  // Active camera preset button
  const [activePreset, setActivePreset] = useState<'side' | 'iso' | 'top' | 'chase' | 'front'>('iso');

  // Initialize Dynamic Flow Particles (Vibrant Aerodynamic Spectrum)
  useEffect(() => {
    const num = 850;
    const vibrantColors = ['#00f0ff', '#38bdf8', '#0ea5e9', '#34d399', '#60a5fa', '#a7f3d0', '#fbbf24'];
    const pArr: Particle3D[] = [];
    for (let i = 0; i < num; i++) {
      pArr.push({
        x: -20 + Math.random() * 40,
        y: -5 + Math.random() * 10,
        z: -7 + Math.random() * 14,
        vx: 0.35 + Math.random() * 0.22,
        vy: 0,
        vz: 0,
        age: Math.random() * 200,
        maxAge: 180 + Math.random() * 100,
        color: vibrantColors[i % vibrantColors.length],
      });
    }
    particlesRef.current = pArr;
  }, []);

  // Sync Audio with simulation speed & stall
  useEffect(() => {
    if (params.audio_enabled) {
      windTunnelAudio.start();
      windTunnelAudio.update(params.airspeed_kts, telemetry.mach, telemetry.isStalled);
    } else {
      windTunnelAudio.stop();
    }
  }, [params.audio_enabled, params.airspeed_kts, telemetry.mach, telemetry.isStalled]);

  // Camera preset selector
  const setCameraPreset = (preset: 'side' | 'iso' | 'top' | 'chase' | 'front') => {
    setActivePreset(preset);
    setIsAutoOrbit(false);
    const cam = cameraStateRef.current;
    switch (preset) {
      case 'side':
        cam.theta = 0.0;
        cam.phi = 0.05;
        cam.distance = 18;
        break;
      case 'iso':
        cam.theta = 0.85;
        cam.phi = 0.38;
        cam.distance = 18;
        break;
      case 'top':
        cam.theta = 0.0;
        cam.phi = 1.55;
        cam.distance = 19;
        break;
      case 'chase':
        cam.theta = 3.14;
        cam.phi = 0.25;
        cam.distance = 16;
        break;
      case 'front':
        cam.theta = 0.0;
        cam.phi = 0.0;
        cam.distance = 16;
        break;
    }
  };

  // 3D Matrix and Vector Math Utilities
  const project3Dto2D = useCallback((
    v: Vertex3D,
    camX: number,
    camY: number,
    camZ: number,
    viewMatrix: number[][],
    focalLength: number,
    cx: number,
    cy: number
  ) => {
    // Relative to camera
    const rx = v.x - camX;
    const ry = v.y - camY;
    const rz = v.z - camZ;

    // Multiply by camera rotation matrix
    const vx = rx * viewMatrix[0][0] + ry * viewMatrix[0][1] + rz * viewMatrix[0][2];
    const vy = rx * viewMatrix[1][0] + ry * viewMatrix[1][1] + rz * viewMatrix[1][2];
    const vz = rx * viewMatrix[2][0] + ry * viewMatrix[2][1] + rz * viewMatrix[2][2];

    if (vz <= 0.2) return null; // Behind camera plane

    const screenX = cx + (vx * focalLength) / vz;
    const screenY = cy - (vy * focalLength) / vz; // Flip Y for screen space

    return { x: screenX, y: screenY, depth: vz };
  }, []);

  // Main 3D Render Loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const focalLength = Math.min(width, height) * 1.35;
    const now = Date.now();

    // 1. Calculate Camera Position & View Matrix
    const cam = cameraStateRef.current;
    if (isAutoOrbit && !isDraggingRef.current) {
      cam.theta += 0.005; // Smooth cinematic fly-around rotation
    }

    const camX = cam.target.x + cam.distance * Math.cos(cam.phi) * Math.sin(cam.theta);
    const camY = cam.target.y + cam.distance * Math.sin(cam.phi);
    const camZ = cam.target.z + cam.distance * Math.cos(cam.phi) * Math.cos(cam.theta);

    // Forward vector (Target - Eye)
    const fx = cam.target.x - camX;
    const fy = cam.target.y - camY;
    const fz = cam.target.z - camZ;
    const fLen = Math.hypot(fx, fy, fz) || 1;
    const fNorm = { x: fx / fLen, y: fy / fLen, z: fz / fLen };

    // Right vector (Forward x Up [0, 1, 0])
    const rx = -fNorm.z;
    const ry = 0;
    const rz = fNorm.x;
    const rLen = Math.hypot(rx, rz) || 1;
    const rNorm = { x: rx / rLen, y: 0, z: rz / rLen };

    // True Up vector (Right x Forward)
    const ux = rNorm.y * fNorm.z - rNorm.z * fNorm.y;
    const uy = rNorm.z * fNorm.x - rNorm.x * fNorm.z;
    const uz = rNorm.x * fNorm.y - rNorm.y * fNorm.x;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    const uNorm = { x: ux / uLen, y: uy / uLen, z: uz / uLen };

    const viewMatrix = [
      [rNorm.x, rNorm.y, rNorm.z],
      [uNorm.x, uNorm.y, uNorm.z],
      [fNorm.x, fNorm.y, fNorm.z],
    ];

    // 2. Clear Background (Chamber Deep Aerospace Navy Slate)
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, width, height);

    // 3. Render Dynamic Wind Tunnel Coordinate Grid Floor (Vibrant Cyan & Indigo)
    ctx.strokeStyle = 'rgba(30, 58, 95, 0.45)';
    ctx.lineWidth = 1;
    const floorY = -4.5;
    for (let gx = -16; gx <= 16; gx += 4) {
      const p1 = project3Dto2D({ x: gx, y: floorY, z: -8 }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
      const p2 = project3Dto2D({ x: gx, y: floorY, z: 8 }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    for (let gz = -8; gz <= 8; gz += 4) {
      const p1 = project3Dto2D({ x: -16, y: floorY, z: gz }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
      const p2 = project3Dto2D({ x: 16, y: floorY, z: gz }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Honeycomb Inlet on Left (-X = -16) in Glowing Cyan
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    for (let hy = -4; hy <= 4; hy += 2) {
      const p1 = project3Dto2D({ x: -16, y: hy, z: -6 }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
      const p2 = project3Dto2D({ x: -16, y: hy, z: 6 }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // 4. Update and Render Dynamic 3D Flow Particles (PIV Velocity Streaks)
    if (params.show_particles && !isPaused) {
      const pSpeed = Math.max(0.25, (params.airspeed_kts / 380) * 0.58);
      const pList = particlesRef.current;

      for (let i = 0; i < pList.length; i++) {
        const p = pList[i];

        // Bernoulli local acceleration: Air speeds up dynamically over wing suction crest
        let localSpeedMult = 1.0;
        if (p.x > -4 && p.x < 3 && Math.abs(p.z) < 5.5) {
          if (p.y > 0) {
            // Suction crest acceleration
            localSpeedMult = 1.0 + Math.max(0, telemetry.cl) * 0.42;
          } else {
            // Compression slowdown
            localSpeedMult = Math.max(0.6, 1.0 - Math.max(0, telemetry.cl) * 0.22);
          }
        }

        p.x += p.vx * pSpeed * localSpeedMult * 2.2;
        p.age += 1;

        if (p.x > 18 || p.age > p.maxAge) {
          p.x = -18;
          p.y = -4 + Math.random() * 8;
          p.z = -6 + Math.random() * 12;
          p.age = 0;
        }

        const head = project3Dto2D(p, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
        const streakLen = p.vx * localSpeedMult * 1.6;
        const tailPos = { x: p.x - streakLen, y: p.y, z: p.z };
        const tail = project3Dto2D(tailPos, camX, camY, camZ, viewMatrix, focalLength, cx, cy);

        if (head && tail) {
          const alpha = Math.min(0.92, 1 - p.age / p.maxAge);
          ctx.strokeStyle = telemetry.isStalled && p.x > 0 ? '#ef4444' : p.color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(1.0, 24 / head.depth);
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(head.x, head.y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1.0;
    }

    // 5. Dynamic 3D Model Transformation & Aeroelastic Buffet Vibration
    // Fully dynamic model responds to flaps, aoa trim, airspeed, and lift force
    const rawModel = getAircraft3DModel(
      params.modelType, 
      params.flaps_deg, 
      params.angle_of_attack, 
      params.airspeed_kts, 
      telemetry.lift_N
    );
    
    // Dynamic aeroelastic buffet trembles the aircraft pitch in high-alpha or stall
    const buffetShake = telemetry.isStalled 
      ? Math.sin(now * 0.04) * 1.5 + Math.cos(now * 0.07) * 0.95 
      : (params.angle_of_attack > 14 ? Math.sin(now * 0.03) * 0.28 : 0);
    const activeAoA = params.angle_of_attack + buffetShake;

    const pitchRad = (activeAoA * Math.PI) / 180;
    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);

    // Transform vertices (pitching nose-up about aerodynamic center):
    // In relative wind from left (-X), positive AoA pitches nose (x < 0) UP (+Y) and tail (x > 0) DOWN (-Y)
    const transformedVerts: Vertex3D[] = rawModel.vertices.map((v) => {
      const xRot = v.x * cosP + v.y * sinP;
      const yRot = -v.x * sinP + v.y * cosP;
      return { x: xRot, y: yRot, z: v.z };
    });

    // Project all vertices to screen
    const projectedVerts = transformedVerts.map((v) =>
      project3Dto2D(v, camX, camY, camZ, viewMatrix, focalLength, cx, cy)
    );

    // 6. Dynamic 3D Surface Pressure Colormap & Shading (Painter's Algorithm)
    const lightDir = { x: -0.4, y: 0.85, z: 0.45 };
    const lLen = Math.hypot(lightDir.x, lightDir.y, lightDir.z);
    lightDir.x /= lLen;
    lightDir.y /= lLen;
    lightDir.z /= lLen;

    const renderedFaces = rawModel.faces
      .map((face) => {
        const v0 = transformedVerts[face.indices[0]];
        // Newell normal: correct for concave / near-collinear polygons (delta wings), unlike a 3-point cross product
        const norm = computeFaceNormal(transformedVerts, face.indices);

        let avgZ = 0;
        let valid = true;
        for (const idx of face.indices) {
          const p = projectedVerts[idx];
          if (!p) {
            valid = false;
            break;
          }
          avgZ += p.depth;
        }
        avgZ /= face.indices.length;

        // Diffuse Lambertian Shading
        const dot = Math.max(0, norm.x * lightDir.x + norm.y * lightDir.y + norm.z * lightDir.z);
        const ambient = 0.42;
        const intensity = ambient + 0.58 * dot;

        // Specular Blinn-Phong Highlight
        const viewVec = { x: camX - v0.x, y: camY - v0.y, z: camZ - v0.z };
        const vLen = Math.hypot(viewVec.x, viewVec.y, viewVec.z);
        const vNorm = { x: viewVec.x / (vLen || 1), y: viewVec.y / (vLen || 1), z: viewVec.z / (vLen || 1) };
        const halfX = lightDir.x + vNorm.x;
        const halfY = lightDir.y + vNorm.y;
        const halfZ = lightDir.z + vNorm.z;
        const hLen = Math.hypot(halfX, halfY, halfZ);
        const nDotH = Math.max(0, (norm.x * halfX + norm.y * halfY + norm.z * halfZ) / (hLen || 1));
        const spec = Math.pow(nDotH, face.isCanopy ? 32 : 14) * (face.isCanopy ? 0.8 : 0.35);

        return { face, norm, avgZ, intensity, spec, valid };
      })
      .filter((item) => item.valid);

    // Sort back-to-front
    renderedFaces.sort((a, b) => b.avgZ - a.avgZ);

    // Draw faces with Dynamic Aerodynamic CFD Pressure or Realistic Livery
    ctx.lineWidth = 1;
    for (const item of renderedFaces) {
      const { face, intensity, spec, norm } = item;
      const pts = face.indices.map((i) => projectedVerts[i]!);

      // DYNAMIC COLOR COMPUTATION:
      let dynamicColor = face.baseColor;

      if (face.isCanopy) {
        dynamicColor = face.baseColor; // Canopy glass (iridescent gold/tinted)
      } else if (face.isAfterburner) {
        // Glowing pulsing afterburner flame cone
        dynamicColor = params.airspeed_kts > 450 ? (now % 200 > 100 ? '#f97316' : '#ef4444') : '#78350f';
      } else if (params.show_heatmap) {
        // REAL-TIME CFD SURFACE PRESSURE HEATMAP MODE
        // Local pressure coefficient Cp estimation
        let localCp = 0.0;
        if (norm.x < -0.3) {
          // Stagnation face facing relative wind
          localCp = 0.5 + Math.abs(norm.x) * 0.5;
        } else if (face.isWing || norm.y > 0.05) {
          if (norm.y > 0.05) {
            // Upper suction crest
            const chordFrac = face.chordFraction ?? 0.3;
            const suctionPeak = Math.max(0.3, telemetry.cl) * (1.8 / Math.sqrt(Math.max(0.08, chordFrac)));
            localCp = -suctionPeak;
          } else {
            // Lower compression
            localCp = Math.max(0, telemetry.cl * 0.45);
          }
        } else {
          localCp = norm.y < -0.1 ? 0.3 : -0.2;
        }
        dynamicColor = getCfdHeatmapColor(localCp, telemetry.isStalled);
      } else if (telemetry.isStalled && (face.isWing || norm.y > 0.15)) {
        // Dynamic Stall Warning: Boundary layer separation in incandescent crimson
        dynamicColor = '#ef4444';
      } else if (face.isWing) {
        if (norm.y > 0.05) {
          // Upper surface: Bernoulli Suction (Vibrant Sky Blue / Cyan)
          dynamicColor = telemetry.cl > 0.8 ? '#0284c7' : '#38bdf8';
        } else {
          // Lower surface: Dynamic Compression (Warm Amber)
          dynamicColor = '#f59e0b';
        }
      }

      ctx.save();
      ctx.fillStyle = dynamicColor;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Shadow overlay
      const shadowAlpha = Math.max(0, 1 - intensity) * 0.45;
      if (shadowAlpha > 0.02) {
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.fill();
      }

      // Specular highlight sheen
      if (spec > 0.05) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.55, spec)})`;
        ctx.fill();
      }

      ctx.restore();
    }

    // 7. Dynamic Supersonic Afterburner Exhaust Plumes with Pulsing Mach Diamonds
    if (params.airspeed_kts >= 480 && rawModel.exhaustPoints) {
      ctx.save();
      for (const ep of rawModel.exhaustPoints) {
        // Rotate exhaust point with aircraft pitch (nose up, tail down)
        const exX = ep.x * cosP + ep.y * sinP;
        const exY = -ep.x * sinP + ep.y * cosP;
        const plumeLen = 2.8 + (params.airspeed_kts / 1000) * 1.5;
        const exTip = { x: exX + plumeLen * cosP, y: exY - plumeLen * sinP, z: ep.z };

        const pBase = project3Dto2D({ x: exX, y: exY, z: ep.z }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
        const pTip = project3Dto2D(exTip, camX, camY, camZ, viewMatrix, focalLength, cx, cy);

        if (pBase && pTip) {
          // Fiery supersonic exhaust plume gradient
          const grad = ctx.createLinearGradient(pBase.x, pBase.y, pTip.x, pTip.y);
          grad.addColorStop(0, '#fde047');
          grad.addColorStop(0.3, '#f97316');
          grad.addColorStop(0.7, '#ef4444');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0)');

          ctx.strokeStyle = grad;
          ctx.lineWidth = 7 + Math.sin(now * 0.05) * 2;
          ctx.beginPath();
          ctx.moveTo(pBase.x, pBase.y);
          ctx.lineTo(pTip.x, pTip.y);
          ctx.stroke();

          // Dynamic Mach Shock Diamond Discs inside the supersonic exhaust core
          for (let d = 1; d <= 3; d++) {
            const frac = d * 0.25;
            const diaX = exX + plumeLen * frac * cosP;
            const diaY = exY + plumeLen * frac * sinP;
            const pDia = project3Dto2D({ x: diaX, y: diaY, z: ep.z }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
            if (pDia) {
              ctx.fillStyle = '#67e8f9';
              ctx.beginPath();
              ctx.arc(pDia.x, pDia.y, 2.5 + Math.sin(now * 0.08 + d) * 1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.restore();
    }

    // 8. Render Dynamic High-Density 3D Smoke Streamlines (Vibrant Velocity Gradient)
    if (params.show_streamlines) {
      const rakeZ = [-5.2, -3.8, -2.4, -1.2, -0.4, 0.4, 1.2, 2.4, 3.8, 5.2];
      const rakeY = [-1.6, -0.7, 0.0, 0.7, 1.6];
      const downwash = Math.sin(pitchRad) * 2.3;

      ctx.save();
      ctx.lineWidth = 1.8;

      for (const z of rakeZ) {
        for (const y of rakeY) {
          ctx.beginPath();
          let started = false;
          const steps = 34;

          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = -16 + t * 32;
            let py = y;
            let pz = z;

            // Flow deflection around 3D body
            if (px > -4.5 && px < 4.5) {
              const r = Math.hypot(px * 0.7, py * 1.5, pz * 0.5);
              if (r < 3.2) {
                py += (y >= 0 ? 0.75 : -0.75) * (1 - Math.abs(px) / 4.5);
              }
            }

            // Downwash behind trailing edge
            if (px >= 2.0) {
              py -= downwash * (px - 2.0) * 0.085;
              if (telemetry.isStalled && y > -0.2) {
                // Turbulent 3D wake detachment in stall
                py += Math.sin(px * 1.6 + now * 0.006) * 0.42;
                pz += Math.cos(px * 1.6 + now * 0.006) * 0.36;
              }
            }

            const p = project3Dto2D({ x: px, y: py, z: pz }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
            if (p) {
              if (!started) {
                ctx.moveTo(p.x, p.y);
                started = true;
              } else {
                ctx.lineTo(p.x, p.y);
              }
            }
          }

          // Dynamic velocity color gradient:
          // Cyan for high-speed laminar, Amber for lower surface, Red in stall wake
          ctx.strokeStyle = telemetry.isStalled
            ? (y > 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(245, 158, 11, 0.6)')
            : (y > 0 ? 'rgba(56, 189, 248, 0.75)' : 'rgba(52, 211, 153, 0.65)');
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 9. Dynamic 3D Wingtip Helical Vortices (Induced Drag Wake Visualization)
    // Counter-rotating helical vortex spirals peeling off left and right wingtips
    if (params.show_streamlines) {
      let wingtipZ = 5.4;
      let wingtipX = 1.4;
      if (params.modelType === 'airliner') {
        wingtipZ = 7.4;
        wingtipX = 2.6;
      } else if (params.modelType === 'concorde') {
        wingtipZ = 5.0;
        wingtipX = 3.6;
      } else if (params.modelType === 'naca2412' || params.modelType === 'naca0012') {
        wingtipZ = 4.3;
        wingtipX = 1.2;
      }

      const vortexCirculation = Math.max(0.4, Math.abs(telemetry.cl) * 2.0);
      const tipSigns = [-1, 1]; // Left and Right wingtips

      ctx.save();
      ctx.lineWidth = 2.0;

      for (const sign of tipSigns) {
        ctx.beginPath();
        let started = false;
        const vSteps = 42;

        for (let i = 0; i <= vSteps; i++) {
          const t = i / vSteps;
          const px = wingtipX + t * 14;
          const dist = px - wingtipX;
          const radius = 0.18 + dist * 0.085;
          const spin = sign * (dist * 1.8 - now * 0.008 * vortexCirculation);

          const py = -Math.sin(pitchRad) * (dist * 0.09) + radius * Math.sin(spin);
          const pz = sign * wingtipZ + radius * Math.cos(spin);

          const p = project3Dto2D({ x: px, y: py, z: pz }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
          if (p) {
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        // Glowing electric cyan/emerald spiral
        ctx.strokeStyle = sign === 1 ? 'rgba(56, 189, 248, 0.85)' : 'rgba(52, 211, 153, 0.85)';
        ctx.stroke();
      }
      ctx.restore();
    }

    // 10. Dynamic Supersonic Mach Shockwave Cone & Transonic Vapor Cloud (Mach >= 0.92)
    if (params.show_shockwaves && telemetry.mach >= 0.92) {
      const mach = telemetry.mach;
      const noseTip = transformedVerts[0] || { x: -6.0, y: 0, z: 0 };

      // Transonic Vapor Cloud (Prandtl-Glauert Singularity condensation cone near Mach 1)
      if (mach >= 0.92 && mach <= 1.28) {
        const vaporProgress = Math.sin(((mach - 0.92) / 0.36) * Math.PI);
        const vaporAlpha = Math.max(0, Math.min(0.55, vaporProgress * 0.6));
        
        ctx.save();
        ctx.strokeStyle = `rgba(186, 230, 253, ${vaporAlpha})`;
        ctx.fillStyle = `rgba(56, 189, 248, ${vaporAlpha * 0.25})`;
        ctx.lineWidth = 3;

        // Vapor condensation disk behind cockpit
        const vDiskDist = 2.4;
        const vDiskRadius = 2.2 + Math.sin(now * 0.02) * 0.2;
        ctx.beginPath();
        let diskStarted = false;
        for (let a = 0; a <= 20; a++) {
          const angle = (2 * Math.PI * a) / 20;
          const vy = noseTip.y - vDiskDist * sinP + Math.cos(angle) * vDiskRadius * cosP;
          const vz = Math.sin(angle) * vDiskRadius;
          const vx = noseTip.x + vDiskDist * cosP + Math.cos(angle) * vDiskRadius * sinP;

          const proj = project3Dto2D({ x: vx, y: vy, z: vz }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
          if (proj) {
            if (!diskStarted) {
              ctx.moveTo(proj.x, proj.y);
              diskStarted = true;
            } else {
              ctx.lineTo(proj.x, proj.y);
            }
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Supersonic Mach Cone Rings (Mach >= 1.0)
      if (mach >= 1.0) {
        const mu = Math.asin(1 / mach); // Mach angle
        ctx.save();
        const shockColor = mach >= 1.5 ? '#f97316' : '#38bdf8';
        ctx.strokeStyle = shockColor;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = shockColor;
        ctx.shadowBlur = 10;

        const ringDistances = [3, 7, 12];
        for (const d of ringDistances) {
          const ringX = noseTip.x + d * cosP;
          const ringY = noseTip.y - d * sinP;
          const rCurrent = d * Math.tan(mu);

          ctx.beginPath();
          let ringStarted = false;
          for (let a = 0; a <= 24; a++) {
            const angle = (2 * Math.PI * a) / 24;
            const vy = ringY + Math.cos(angle) * rCurrent * cosP;
            const vz = Math.sin(angle) * rCurrent;
            const vx = ringX + Math.cos(angle) * rCurrent * sinP;

            const proj = project3Dto2D({ x: vx, y: vy, z: vz }, camX, camY, camZ, viewMatrix, focalLength, cx, cy);
            if (proj) {
              if (!ringStarted) {
                ctx.moveTo(proj.x, proj.y);
                ringStarted = true;
              } else {
                ctx.lineTo(proj.x, proj.y);
              }
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 11. Dynamic 3D Aerodynamic Lift & Drag Force Vectors (Vibrant Emerald & Amber)
    if (params.show_pressure_vectors) {
      const acPos = { x: 0, y: 0, z: 0 };
      const acProj = project3Dto2D(acPos, camX, camY, camZ, viewMatrix, focalLength, cx, cy);

      if (acProj) {
        // Lift vector points vertically (+Y)
        const buffet = telemetry.isStalled ? (Math.random() - 0.5) * 0.4 : 0;
        const liftLen = Math.max(-1.5, Math.min(5.5, telemetry.cl * 2.8)) + buffet;
        const liftTip = { x: 0, y: liftLen, z: 0 };
        const liftProj = project3Dto2D(liftTip, camX, camY, camZ, viewMatrix, focalLength, cx, cy);

        // Drag vector points downstream (+X)
        const dragLen = Math.max(0.6, Math.min(5.0, telemetry.cd * 12.0));
        const dragTip = { x: dragLen, y: 0, z: 0 };
        const dragProj = project3Dto2D(dragTip, camX, camY, camZ, viewMatrix, focalLength, cx, cy);

        ctx.save();
        // Aerodynamic Center Gimbal Marker
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(acProj.x, acProj.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 1. Draw Lift Vector Arrow (Vibrant Emerald, turns Crimson in stall)
        if (liftProj) {
          const isUp = liftProj.y < acProj.y;
          const liftColor = telemetry.isStalled ? '#ef4444' : '#10b981';
          ctx.strokeStyle = liftColor;
          ctx.fillStyle = liftColor;
          ctx.lineWidth = 3;

          ctx.beginPath();
          ctx.moveTo(acProj.x, acProj.y);
          ctx.lineTo(liftProj.x, liftProj.y);
          ctx.stroke();

          // Arrowhead
          const angleL = Math.atan2(liftProj.y - acProj.y, liftProj.x - acProj.x);
          ctx.beginPath();
          ctx.moveTo(liftProj.x, liftProj.y);
          ctx.lineTo(liftProj.x - 10 * Math.cos(angleL - Math.PI / 6), liftProj.y - 10 * Math.sin(angleL - Math.PI / 6));
          ctx.lineTo(liftProj.x - 10 * Math.cos(angleL + Math.PI / 6), liftProj.y - 10 * Math.sin(angleL + Math.PI / 6));
          ctx.closePath();
          ctx.fill();

          // Text label
          ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
          const liftText = `LIFT: ${(telemetry.lift_N / 1000).toFixed(1)} kN`;
          ctx.fillText(liftText, liftProj.x + 8, isUp ? liftProj.y - 6 : liftProj.y + 16);
        }

        // 2. Draw Drag Vector Arrow (Vibrant Amber)
        if (dragProj) {
          const dragColor = '#f59e0b';
          ctx.strokeStyle = dragColor;
          ctx.fillStyle = dragColor;
          ctx.lineWidth = 3;

          ctx.beginPath();
          ctx.moveTo(acProj.x, acProj.y);
          ctx.lineTo(dragProj.x, dragProj.y);
          ctx.stroke();

          // Arrowhead
          const angleD = Math.atan2(dragProj.y - acProj.y, dragProj.x - acProj.x);
          ctx.beginPath();
          ctx.moveTo(dragProj.x, dragProj.y);
          ctx.lineTo(dragProj.x - 10 * Math.cos(angleD - Math.PI / 6), dragProj.y - 10 * Math.sin(angleD - Math.PI / 6));
          ctx.lineTo(dragProj.x - 10 * Math.cos(angleD + Math.PI / 6), dragProj.y - 10 * Math.sin(angleD + Math.PI / 6));
          ctx.closePath();
          ctx.fill();

          // Text label
          ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
          const dragText = `DRAG: ${(telemetry.drag_N / 1000).toFixed(1)} kN`;
          ctx.fillText(dragText, dragProj.x + 8, dragProj.y + 14);
        }

        ctx.restore();
      }
    }

    // Request next frame
    animFrameIdRef.current = requestAnimationFrame(render);
  }, [params, telemetry, isPaused, isAutoOrbit, project3Dto2D]);

  // Start / restart render loop
  useEffect(() => {
    animFrameIdRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [render]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse & Touch 3D Camera Orbit Controls & Shift-Drag AoA Pitching
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    isShiftDragRef.current = e.shiftKey;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isShiftDragRef.current) {
      // Shift+Drag pitches Angle of Attack directly
      const deltaAoa = -dy * 0.2;
      const newAoa = Math.max(-20, Math.min(35, params.angle_of_attack + deltaAoa));
      onParamChange('angle_of_attack', parseFloat(newAoa.toFixed(1)));
    } else {
      // Orbit camera
      const cam = cameraStateRef.current;
      cam.theta -= dx * 0.008;
      cam.phi = Math.max(-1.45, Math.min(1.45, cam.phi + dy * 0.008));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Scroll to Zoom in 3D
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const cam = cameraStateRef.current;
    cam.distance = Math.max(8, Math.min(32, cam.distance + e.deltaY * 0.02));
  };

  return (
    <div className="relative w-full h-[420px] sm:h-[480px] lg:h-[540px] rounded-xl overflow-hidden border border-slate-800 bg-[#060a12] select-none shadow-2xl">
      {/* Real 3D Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Top Left: 3D Aircraft Model Telemetry Badge (Vibrant Aerodynamic Styling) */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
        <div className="px-3.5 py-1.5 rounded-lg bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 shadow-lg shadow-cyan-950/30 flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-white font-sans tracking-wide">
            {AIRCRAFT_MODELS[params.modelType].name} (Blender CAD 3D)
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-xs text-cyan-300 font-mono font-bold">
            α: {params.angle_of_attack >= 0 ? '+' : ''}{params.angle_of_attack.toFixed(1)}°
          </span>
          {params.show_heatmap && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
              CFD HEATMAP
            </span>
          )}
        </div>

        {telemetry.isStalled && (
          <div className="px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-500 shadow-lg shadow-red-950/60 flex items-center gap-1.5 animate-bounce">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-bold text-red-100 uppercase tracking-wider font-mono">
              STALL DETECTED
            </span>
          </div>
        )}

        {telemetry.mach >= 1.0 && (
          <div className="px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-500 shadow-lg flex items-center gap-1.5 animate-pulse">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-200 font-mono">
              MACH {telemetry.mach.toFixed(2)} SHOCK CONE
            </span>
          </div>
        )}

        {params.airspeed_kts >= 480 && (
          <div className="px-3 py-1.5 rounded-lg bg-orange-950/90 border border-orange-500/80 shadow-lg flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-400 animate-bounce" />
            <span className="text-xs font-bold text-orange-200 font-mono">
              AFTERBURNER ACTIVE
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Camera Presets & Dynamic Features */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {onOpenWebGL && (
          <button
            onClick={onOpenWebGL}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/90 hover:bg-cyan-900/90 border border-cyan-400/50 text-cyan-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-950/60"
            title="Switch to Photorealistic WebGL 3D GLB Engine"
          >
            <Box className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="hidden sm:inline">WebGL 3D GLB</span>
          </button>
        )}

        {onOpenModelInspector && (
          <button
            onClick={onOpenModelInspector}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5"
            title="Inspect 3D CAD Asset"
          >
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Inspect CAD</span>
          </button>
        )}

        <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-800">
          <button
            onClick={() => setCameraPreset('side')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activePreset === 'side' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setCameraPreset('iso')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activePreset === 'iso' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Isometric
          </button>
          <button
            onClick={() => setCameraPreset('top')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activePreset === 'top' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Planform
          </button>
          <button
            onClick={() => setCameraPreset('chase')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              activePreset === 'chase' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chase
          </button>
        </div>

        {/* 360 Cinematic Orbit Toggle */}
        <button
          onClick={() => setIsAutoOrbit((prev) => !prev)}
          className={`p-2 rounded-lg backdrop-blur-md border transition-all ${
            isAutoOrbit
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm animate-pulse'
              : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title={isAutoOrbit ? 'Stop 360° Cinematic Orbit' : 'Start 360° Cinematic Orbit'}
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* Force Vectors Toggle */}
        <button
          onClick={() => onParamChange('show_pressure_vectors', !params.show_pressure_vectors)}
          className={`p-2 rounded-lg backdrop-blur-md border transition-all ${
            params.show_pressure_vectors
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
              : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title={params.show_pressure_vectors ? 'Hide 3D Force Vectors (Lift & Drag)' : 'Show 3D Force Vectors (Lift & Drag)'}
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>

        {/* Audio Toggle */}
        <button
          onClick={() => onParamChange('audio_enabled', !params.audio_enabled)}
          className={`p-2 rounded-lg backdrop-blur-md border transition-all ${
            params.audio_enabled
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
              : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title={params.audio_enabled ? 'Mute Wind Tunnel Audio' : 'Enable Wind Tunnel Audio'}
        >
          {params.audio_enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Reset Camera */}
        <button
          onClick={() => setCameraPreset('iso')}
          className="p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors shadow-sm"
          title="Reset Camera"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Floating Legend / Help Overlay (Vibrant Aerodynamic Styling) */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-2.5 bg-slate-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-slate-800 shadow-lg">
          <span className="text-slate-200 font-medium">3D Wind Tunnel</span>
          <span className="text-slate-600">·</span>
          <span className="text-cyan-400">Drag to Orbit 360°</span>
          <span className="text-slate-600">·</span>
          <span className="text-amber-400">Shift+Drag to Pitch AoA</span>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-2 pl-1 border-l border-slate-800">
            <span className="w-2 h-2 rounded-full bg-cyan-400" title="Bernoulli Suction" />
            <span className="text-[11px] text-cyan-300 font-mono">Suction</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 ml-1" title="Dynamic Compression" />
            <span className="text-[11px] text-amber-300 font-mono">Compression</span>
            {params.show_pressure_vectors && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" title="Lift Vector" />
                <span className="text-[11px] text-emerald-300 font-mono">Lift</span>
                <span className="w-2 h-2 rounded-full bg-amber-500 ml-1" title="Drag Vector" />
                <span className="text-[11px] text-amber-400 font-mono">Drag</span>
              </>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-slate-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-slate-800 shadow-lg">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400 font-mono font-semibold">L/D: {telemetry.ldRatio.toFixed(1)}:1</span>
          <span className="text-slate-600">·</span>
          <span className="text-cyan-300 font-mono">q: {(telemetry.dynamic_pressure_pa / 1000).toFixed(1)} kPa</span>
        </div>
      </div>
    </div>
  );
};