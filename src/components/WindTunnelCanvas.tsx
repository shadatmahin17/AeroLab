import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SimulationParams, AeroTelemetry, Point2D } from '../types/aerodynamics';
import { FluidSolver } from '../engine/FluidSolver';
import {
  getBasePolygon,
  transformModelPolygon,
  getSurfacePointsWithNormals,
  isPointInPolygon,
  AIRCRAFT_MODELS,
} from '../utils/airfoilGenerators';
import { windTunnelAudio } from '../utils/audio';
import { 
  RotateCw, 
  AlertTriangle, 
  Zap, 
  Volume2, 
  VolumeX, 
  Compass, 
  ArrowUpRight, 
  Activity,
  Flame,
  Layers
} from 'lucide-react';

interface WindTunnelCanvasProps {
  params: SimulationParams;
  onParamChange: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  telemetry: AeroTelemetry;
  isPaused: boolean;
}

export const WindTunnelCanvas: React.FC<WindTunnelCanvasProps> = ({
  params,
  onParamChange,
  telemetry,
  isPaused,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const solverRef = useRef<FluidSolver | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Drag & interactive pitch state
  const isDraggingModelRef = useRef(false);
  const dragStartAngleRef = useRef(0);
  const dragCenterRef = useRef<Point2D>({ x: 0, y: 0 });
  const [isHoveringModel, setIsHoveringModel] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  // Initialize Fluid Solver
  useEffect(() => {
    solverRef.current = new FluidSolver(76, 44);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      windTunnelAudio.stop();
    };
  }, []);

  // Sync Audio Engine with parameters
  useEffect(() => {
    if (params.audio_enabled) {
      windTunnelAudio.start();
      windTunnelAudio.update(params.airspeed_kts, telemetry.mach, telemetry.isStalled);
    } else {
      windTunnelAudio.stop();
    }
  }, [params.audio_enabled, params.airspeed_kts, telemetry.mach, telemetry.isStalled]);

  // Main Render Loop
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const solver = solverRef.current;
    if (!canvas || !solver) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const now = Date.now();

    // Aircraft model placement in wind tunnel
    const modelCx = width * 0.44;
    const modelCy = height * 0.50;
    const chordPx = Math.min(width * 0.38, 280);
    dragCenterRef.current = { x: modelCx, y: modelCy };

    // Get current aircraft polygon transformed by Angle of Attack (consistent upright convention)
    const basePolygon = getBasePolygon(params.modelType, params.flaps_deg);
    const modelPolygon = transformModelPolygon(
      basePolygon,
      modelCx,
      modelCy,
      chordPx,
      params.angle_of_attack
    );

    // Update solver obstacle mask
    solver.updateObstacleMask(modelPolygon, width, height);

    // Step physics if not paused
    if (!isPaused) {
      const inflowVel = Math.min(2.5, 0.4 + (params.airspeed_kts / 400) * 1.2);
      solver.step(
        inflowVel,
        params.viscosity,
        params.smoke_density,
        params.angle_of_attack,
        telemetry.isStalled,
        0.12
      );
    }

    // 1. CLEAR & BACKGROUND (Antigravity Volumetric Deep Space Radial Chamber)
    const bgGrad = ctx.createRadialGradient(modelCx, modelCy, 30, modelCx, modelCy, width * 0.75);
    bgGrad.addColorStop(0, '#0a1329'); // Deep energetic indigo-cyan core
    bgGrad.addColorStop(0.55, '#060a16'); // Mid slate
    bgGrad.addColorStop(1, '#03060d'); // Cosmic edge
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. VOLUMETRIC PIV LASER SHEET ILLUMINATION & OPTICAL GRATICULE
    // Horizontal laser sheet slice through the tunnel
    const laserGrad = ctx.createLinearGradient(0, modelCy - 8, 0, modelCy + 8);
    laserGrad.addColorStop(0, 'rgba(56, 189, 248, 0.0)');
    laserGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.08)');
    laserGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = laserGrad;
    ctx.fillRect(0, modelCy - 12, width, 24);

    // Subtle optical graticule grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    const gridStep = 44;
    for (let x = 0; x < width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Top & Bottom Floating Acoustic Liner Rails with Cyan Micro-Ports
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, width, 14);
    ctx.fillRect(0, height - 14, width, 14);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.strokeRect(0, 0, width, 14);
    ctx.strokeRect(0, height - 14, width, 14);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    for (let x = 12; x < width - 12; x += 22) {
      ctx.fillRect(x, 5, 8, 4);
      ctx.fillRect(x, height - 9, 8, 4);
    }

    // 3. VELOCITY HEATMAP (Vibrant Scientific CFD Spectrum)
    if (params.show_heatmap) {
      const cellW = width / solver.nx;
      const cellH = height / solver.ny;
      const baseVel = Math.max(0.5, (params.airspeed_kts / 300));

      for (let i = 1; i <= solver.nx; i++) {
        for (let j = 1; j <= solver.ny; j++) {
          const idx = solver.IX(i, j);
          if (solver.mask[idx] === 1) continue;

          const uVal = solver.u[idx];
          const vVal = solver.v[idx];
          const mag = Math.hypot(uVal, vVal);
          const ratio = mag / baseVel;

          let r = 10, g = 30, b = 70, a = 0.38;
          if (ratio < 0.75) {
            // Stagnation
            r = Math.floor(14 + ratio * 35);
            g = Math.floor(55 + ratio * 110);
            b = Math.floor(180 + ratio * 75);
          } else if (ratio < 1.35) {
            // Nominal attached
            const t = (ratio - 0.75) / 0.6;
            r = Math.floor(20 + t * 45);
            g = Math.floor(165 + t * 90);
            b = Math.floor(240 - t * 90);
          } else {
            // Suction crest acceleration or shock
            const t = Math.min(1.0, (ratio - 1.35) / 0.85);
            r = Math.floor(65 + t * 190);
            g = Math.floor(235 - t * 95);
            b = Math.floor(110 - t * 90);
          }

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
          ctx.fillRect((i - 1) * cellW, (j - 1) * cellH, cellW + 1, cellH + 1);
        }
      }
    }

    // 4. SMOKE STREAMLINES (Vibrant Luminous Schlieren Ribbons)
    if (params.show_streamlines) {
      const cellW = width / solver.nx;
      const cellH = height / solver.ny;

      for (let i = 1; i <= solver.nx; i++) {
        for (let j = 1; j <= solver.ny; j++) {
          const d = solver.dens[solver.IX(i, j)];
          if (d > 0.035) {
            const alpha = Math.min(0.88, d * 0.32);
            ctx.fillStyle = telemetry.isStalled && i > solver.nx * 0.45 && j < solver.ny * 0.55
              ? `rgba(239, 68, 68, ${alpha})`
              : `rgba(56, 189, 248, ${alpha})`;
            ctx.fillRect((i - 1) * cellW, (j - 1) * cellH, cellW + 1, cellH + 1);
          }
        }
      }
    }

    // 5. VECTOR QUIVER ARROWS (Spatial Velocity Needles)
    if (params.show_quiver) {
      ctx.lineWidth = 1.2;
      const step = 4;
      const cellW = width / solver.nx;
      const cellH = height / solver.ny;

      for (let i = 2; i < solver.nx; i += step) {
        for (let j = 2; j < solver.ny; j += step) {
          const idx = solver.IX(i, j);
          if (solver.mask[idx] === 1) continue;

          const vx = solver.u[idx] * 12;
          const vy = solver.v[idx] * 12;
          const px = (i - 0.5) * cellW;
          const py = (j - 0.5) * cellH;

          const speed = Math.hypot(vx, vy);
          if (speed > 0.4) {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + vx, py + vy);
            ctx.stroke();

            const angle = Math.atan2(vy, vx);
            ctx.beginPath();
            ctx.moveTo(px + vx, py + vy);
            ctx.lineTo(px + vx - 3.5 * Math.cos(angle - Math.PI / 6), py + vy - 3.5 * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(px + vx - 3.5 * Math.cos(angle + Math.PI / 6), py + vy - 3.5 * Math.sin(angle + Math.PI / 6));
            ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.fill();
          }
        }
      }
    }

    // 6. PARTICLES (Weightless Quantum Flow Tracers with Energy Glow)
    if (params.show_particles && !isPaused) {
      const pScale = Math.min(3.0, 0.8 + (params.airspeed_kts / 300));
      for (const p of solver.particles) {
        const vel = solver.getVelocityAt(p.x, p.y, width, height);
        p.vx = p.vx * 0.75 + vel.u * 14 * pScale * 0.25;
        p.vy = p.vy * 0.75 + vel.v * 14 * pScale * 0.25;

        p.x += p.vx;
        p.y += p.vy;
        p.age += 1;

        // Obstacle avoidance
        if (isPointInPolygon(p.x, p.y, modelPolygon)) {
          p.x -= p.vx * 1.5;
          p.y += (p.y > modelCy ? 4 : -4);
        }

        // Recycle particles
        if (p.x > width || p.x < 0 || p.y < 15 || p.y > height - 15 || p.age > p.maxAge) {
          p.x = Math.random() * 20;
          p.y = 20 + Math.random() * (height - 40);
          p.vx = 4.0;
          p.vy = 0;
          p.age = 0;
        }

        // Draw luminous tracer
        const lifeRatio = 1 - p.age / p.maxAge;
        ctx.fillStyle = telemetry.isStalled && p.x > modelCx ? '#f87171' : p.color;
        ctx.globalAlpha = Math.max(0.12, lifeRatio * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    // 7. SUPERSONIC MACH SHOCKWAVE & TRANSONIC CONDENSATION CLOUD
    if (params.show_shockwaves && telemetry.mach >= 0.92) {
      const mach = telemetry.mach;
      const machAngleRad = mach >= 1.0 ? Math.asin(1 / mach) : Math.PI / 2;
      const aoaRad = (params.angle_of_attack * Math.PI) / 180;
      const nosePt = modelPolygon[0];
      const shockLength = width * 0.55;

      ctx.save();
      // Transonic vapor cloud near Mach 1
      if (mach >= 0.92 && mach <= 1.25) {
        const vaporProgress = Math.sin(((mach - 0.92) / 0.33) * Math.PI);
        const vaporAlpha = Math.max(0, Math.min(0.45, vaporProgress * 0.5));
        ctx.fillStyle = `rgba(56, 189, 248, ${vaporAlpha * 0.35})`;
        ctx.strokeStyle = `rgba(186, 230, 253, ${vaporAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nosePt.x + 35, nosePt.y - 4, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (mach >= 1.0) {
        const shockColor = mach >= 1.5 ? '#f97316' : '#38bdf8';
        ctx.strokeStyle = shockColor;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = shockColor;
        ctx.shadowBlur = 10;

        // Upper oblique shock
        ctx.beginPath();
        ctx.moveTo(nosePt.x, nosePt.y);
        ctx.lineTo(
          nosePt.x + shockLength * Math.cos(-aoaRad - machAngleRad),
          nosePt.y + shockLength * Math.sin(-aoaRad - machAngleRad)
        );
        ctx.stroke();

        // Lower oblique shock
        ctx.beginPath();
        ctx.moveTo(nosePt.x, nosePt.y);
        ctx.lineTo(
          nosePt.x + shockLength * Math.cos(-aoaRad + machAngleRad),
          nosePt.y + shockLength * Math.sin(-aoaRad + machAngleRad)
        );
        ctx.stroke();

        // Label shock wave
        ctx.fillStyle = shockColor;
        ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
        ctx.fillText(`MACH ${mach.toFixed(2)} SHOCK CONE (μ: ${(machAngleRad * 180 / Math.PI).toFixed(1)}°)`, nosePt.x + 40, nosePt.y - 25);
      }
      ctx.restore();
    }

    // 8. REDESIGNED 2D AIRCRAFT MODEL (Antigravity Spatial Aerospace Craft)
    if (modelPolygon.length > 0) {
      ctx.save();

      // Antigravity subtle floating micro-bobbing (weightless suspension in chamber)
      const floatOffset = Math.sin(now * 0.0022) * 1.5;

      // Layer A: Deep Diffused Weightless Drop-Shadow (Grounding & Z-elevation)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetX = 8;
      ctx.shadowOffsetY = 12 + floatOffset;

      // Layer B: Lift-induced Antigravity Ventral Aura
      const auraGrad = ctx.createRadialGradient(
        modelCx,
        modelCy + 15,
        chordPx * 0.1,
        modelCx,
        modelCy + 25,
        chordPx * 0.55
      );
      auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
      auraGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.04)');
      auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(modelCx, modelCy + 15, chordPx * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // Layer C: Main Airframe with Metallic Composite Dual-Tone & Specular Highlights
      const craftGrad = ctx.createLinearGradient(
        modelCx,
        modelCy - chordPx * 0.22,
        modelCx,
        modelCy + chordPx * 0.22
      );

      if (telemetry.isStalled) {
        // High-alpha stall separation crimson
        craftGrad.addColorStop(0, '#7f1d1d');
        craftGrad.addColorStop(0.35, '#991b1b');
        craftGrad.addColorStop(0.7, '#450a0a');
        craftGrad.addColorStop(1, '#1c0505');
      } else {
        // Futuristic aerospace titanium-carbon composite
        craftGrad.addColorStop(0, '#334155'); // Dorsal titanium specular ridge
        craftGrad.addColorStop(0.2, '#1e293b'); // Mid fuselage radar-absorbent material
        craftGrad.addColorStop(0.65, '#0f172a'); // Ventral keel shadow
        craftGrad.addColorStop(1, '#090d16');
      }

      ctx.fillStyle = craftGrad;
      ctx.strokeStyle = isHoveringModel || isRotating ? '#00f0ff' : 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = isHoveringModel || isRotating ? 2.4 : 1.8;

      // Render craft outer hull
      ctx.beginPath();
      ctx.moveTo(modelPolygon[0].x, modelPolygon[0].y + floatOffset);
      for (let i = 1; i < modelPolygon.length; i++) {
        ctx.lineTo(modelPolygon[i].x, modelPolygon[i].y + floatOffset);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Reset shadows for clean internal detailing
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Layer D: Tactical Titanium Leading Edge Bevel Streak
      if (modelPolygon.length > 8) {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const le1 = modelPolygon[0];
        const le2 = modelPolygon[1];
        const le3 = modelPolygon[2];
        if (le1 && le2 && le3) {
          ctx.moveTo(le1.x, le1.y + floatOffset);
          ctx.lineTo(le2.x, le2.y + floatOffset);
          ctx.lineTo(le3.x, le3.y + floatOffset);
          ctx.stroke();
        }
      }

      // Layer E: Laser-Scribed Structural Panel Lines & Seams
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1;
      const nPts = modelPolygon.length;
      if (nPts >= 12) {
        // Cockpit bulkhead seam
        const seamTop = modelPolygon[Math.floor(nPts * 0.22)];
        const seamBottom = modelPolygon[Math.floor(nPts * 0.82)];
        if (seamTop && seamBottom) {
          ctx.beginPath();
          ctx.moveTo(seamTop.x, seamTop.y + floatOffset);
          ctx.lineTo(seamBottom.x, seamBottom.y + floatOffset);
          ctx.stroke();
        }
        // Wing root / weapon bay seam
        const wingTop = modelPolygon[Math.floor(nPts * 0.35)];
        const wingBottom = modelPolygon[Math.floor(nPts * 0.70)];
        if (wingTop && wingBottom) {
          ctx.beginPath();
          ctx.moveTo(wingTop.x, wingTop.y + floatOffset);
          ctx.lineTo(wingBottom.x, wingBottom.y + floatOffset);
          ctx.stroke();
        }
      }

      // Layer F: Glassmorphic Cockpit Canopy (Amber Solar Reflective + Optical HUD)
      if (params.modelType === 'f22' || params.modelType === 'airliner' || params.modelType === 'concorde') {
        const pCanopy1 = modelPolygon[Math.floor(modelPolygon.length * 0.14)];
        const pCanopy2 = modelPolygon[Math.floor(modelPolygon.length * 0.23)];
        if (pCanopy1 && pCanopy2) {
          const canopyCx = (pCanopy1.x + pCanopy2.x) / 2;
          const canopyCy = (pCanopy1.y + pCanopy2.y) / 2 + floatOffset;
          const canopyRadius = Math.max(6, chordPx * 0.038);

          // Glassmorphic dual-gradient (Indium Tin Oxide solar tint to optical cyan)
          const glassGrad = ctx.createLinearGradient(
            canopyCx - canopyRadius,
            canopyCy - canopyRadius,
            canopyCx + canopyRadius,
            canopyCy + canopyRadius
          );
          glassGrad.addColorStop(0, 'rgba(251, 191, 36, 0.65)'); // Solar gold reflection
          glassGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.35)'); // Optical cyan glass
          glassGrad.addColorStop(1, 'rgba(15, 23, 42, 0.75)'); // Cockpit interior depth

          ctx.fillStyle = glassGrad;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(canopyCx, canopyCy, canopyRadius * 1.4, canopyRadius * 0.85, (params.angle_of_attack * Math.PI) / -180, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Glass specular sheen highlight
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(canopyCx - 2, canopyCy - canopyRadius * 0.4, canopyRadius * 0.5, Math.PI * 1.1, Math.PI * 1.8);
          ctx.stroke();

          // Internal collimated Holographic HUD reticle
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(canopyCx - 1, canopyCy - 1, 2, 2);
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(canopyCx, canopyCy, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Layer G: Bernoulli Low-Pressure Suction Halo (Luminous Expansion Crest)
      if (telemetry.cl > 0.1 && !telemetry.isStalled) {
        ctx.save();
        const suctionIntensity = Math.min(1.0, telemetry.cl * 0.7 + (params.airspeed_kts / 600) * 0.3);
        const crestPt = modelPolygon[Math.floor(modelPolygon.length * 0.25)] || modelPolygon[0];
        
        const suctionGlow = ctx.createRadialGradient(
          crestPt.x,
          crestPt.y - 10 + floatOffset,
          2,
          crestPt.x,
          crestPt.y - 10 + floatOffset,
          chordPx * 0.35
        );
        suctionGlow.addColorStop(0, `rgba(0, 240, 255, ${0.45 * suctionIntensity})`);
        suctionGlow.addColorStop(0.5, `rgba(56, 189, 248, ${0.18 * suctionIntensity})`);
        suctionGlow.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
        
        ctx.fillStyle = suctionGlow;
        ctx.beginPath();
        ctx.arc(crestPt.x, crestPt.y - 10 + floatOffset, chordPx * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Layer H: Pitot Probe & Stagnation High-Pressure Bead
      const nosePt = modelPolygon[0];
      if (nosePt) {
        ctx.save();
        const stagColor = telemetry.mach >= 1.0 ? '#f97316' : '#38bdf8';
        ctx.fillStyle = stagColor;
        ctx.shadowColor = stagColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(nosePt.x, nosePt.y + floatOffset, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Layer I: Mechanical Trailing Flap Hinge Pin & Actuator
      if (params.flaps_deg > 0) {
        const flapIdx = Math.floor(modelPolygon.length * 0.42);
        const flapPt = modelPolygon[flapIdx];
        if (flapPt) {
          ctx.fillStyle = '#f59e0b';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(flapPt.x, flapPt.y + floatOffset, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Deflection label
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 9px ui-monospace, SFMono-Regular, monospace';
          ctx.fillText(`FLAP ${params.flaps_deg}°`, flapPt.x + 8, flapPt.y + 12 + floatOffset);
        }
      }

      // Layer J: Chord Reference Waterline with Glowing Laser Datum
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(modelCx - chordPx * 0.35, modelCy + floatOffset);
      ctx.lineTo(modelCx + chordPx * 0.85, modelCy + floatOffset);
      ctx.stroke();
      ctx.setLineDash([]);

      // Layer K: Aerodynamic Center (AC) Floating Holographic Gimbal Sphere
      ctx.fillStyle = '#00f0ff';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(modelCx, modelCy + floatOffset, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Subtle pulse ring around AC
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.arc(modelCx, modelCy + floatOffset, 8 + Math.sin(now * 0.005) * 2, 0, Math.PI * 2);
      ctx.stroke();

      // Layer L: Supersonic Exhaust Reheat & Mach Diamonds (airspeed >= 450 kts)
      if (params.airspeed_kts >= 450) {
        const tailPt = modelPolygon[Math.floor(modelPolygon.length * 0.5)];
        if (tailPt) {
          const plumeLen = 48 + (params.airspeed_kts / 1000) * 45;
          const exGrad = ctx.createLinearGradient(
            tailPt.x,
            tailPt.y + floatOffset,
            tailPt.x + plumeLen,
            tailPt.y + floatOffset
          );
          exGrad.addColorStop(0, '#fde047');
          exGrad.addColorStop(0.25, '#f97316');
          exGrad.addColorStop(0.65, '#ef4444');
          exGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');

          ctx.save();
          ctx.strokeStyle = exGrad;
          ctx.lineWidth = 7 + Math.sin(now * 0.04) * 2.5;
          ctx.beginPath();
          ctx.moveTo(tailPt.x, tailPt.y + floatOffset);
          ctx.lineTo(tailPt.x + plumeLen, tailPt.y + floatOffset);
          ctx.stroke();

          // Shock diamond discs (transonic expansion nodes)
          for (let d = 1; d <= 4; d++) {
            const diamondX = tailPt.x + plumeLen * (d * 0.22);
            ctx.fillStyle = '#67e8f9';
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(diamondX, tailPt.y + floatOffset, 2.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      ctx.restore();
    }

    // 9. DYNAMIC SURFACE PRESSURE VECTORS (Holographic Needles)
    if (params.show_pressure_vectors) {
      const surfacePoints = getSurfacePointsWithNormals(modelPolygon);
      ctx.save();
      const arrowStep = Math.max(1, Math.floor(surfacePoints.length / 28));

      for (let i = 0; i < surfacePoints.length; i += arrowStep) {
        const pt = surfacePoints[i];
        const cp = solver.getPressureCoeffAt(pt.x, pt.y, width, height, params.airspeed_kts / 300);

        const arrowMag = Math.min(38, Math.abs(cp) * 26);
        if (arrowMag < 2) continue;

        const isSuction = cp < 0;
        const arrowColor = isSuction ? '#00f0ff' : '#f59e0b';

        ctx.strokeStyle = arrowColor;
        ctx.fillStyle = arrowColor;
        ctx.lineWidth = 1.6;

        // Vector direction
        const dir = isSuction ? 1 : -1;
        const endX = pt.x + pt.nx * arrowMag * dir;
        const endY = pt.y + pt.ny * arrowMag * dir;

        // Surface anchor bead
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Vector shaft
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(endY - pt.y, endX - pt.x);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 4 * Math.cos(angle - Math.PI / 6), endY - 4 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - 4 * Math.cos(angle + Math.PI / 6), endY - 4 * Math.sin(angle + Math.PI / 6));
        ctx.fill();
      }
      ctx.restore();
    }

    // 10. INTERACTIVE HOLOGRAPHIC ATTITUDE GIMBAL DIAL (On Hover/Drag or Active)
    if (isRotating || isHoveringModel) {
      ctx.save();
      const ringRadius = chordPx * 0.58;

      // Outer holographic gimbal ring with subtle dash
      ctx.strokeStyle = isRotating ? '#00f0ff' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = isRotating ? 2.0 : 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(modelCx, modelCy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle inner attitude guide ring
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(modelCx, modelCy, ringRadius * 0.88, 0, Math.PI * 2);
      ctx.stroke();

      // Degree radial ticks on front sector (-20 deg to +30 deg AoA)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.2;
      for (let deg = -20; deg <= 35; deg += 5) {
        const rad = Math.PI - (deg * Math.PI) / 180;
        const isMajor = deg % 10 === 0;
        const tickInner = isMajor ? ringRadius - 12 : ringRadius - 6;
        const tickOuter = ringRadius + (isMajor ? 4 : 2);

        ctx.beginPath();
        ctx.moveTo(modelCx + Math.cos(rad) * tickInner, modelCy + Math.sin(rad) * tickInner);
        ctx.lineTo(modelCx + Math.cos(rad) * tickOuter, modelCy + Math.sin(rad) * tickOuter);
        ctx.stroke();

        if (isMajor) {
          ctx.fillStyle = deg === 0 ? '#38bdf8' : 'rgba(148, 163, 184, 0.8)';
          ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            `${deg > 0 ? '+' : ''}${deg}°`,
            modelCx + Math.cos(rad) * (ringRadius + 18),
            modelCy + Math.sin(rad) * (ringRadius + 18)
          );
        }
      }

      // Dial angle pointer / grab handle
      const aoaRad = (params.angle_of_attack * Math.PI) / 180;
      const dialAngle = Math.PI - aoaRad;
      const markerX = modelCx + Math.cos(dialAngle) * ringRadius;
      const markerY = modelCy + Math.sin(dialAngle) * ringRadius;

      // Pointer line to aircraft aerodynamic center
      ctx.strokeStyle = isRotating ? 'rgba(0, 240, 255, 0.7)' : 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(modelCx, modelCy);
      ctx.lineTo(markerX, markerY);
      ctx.stroke();

      // Grab Node Bead (Pulsing Glow)
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = isRotating ? 14 : 8;
      ctx.beginPath();
      ctx.arc(markerX, markerY, isRotating ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Floating Glassmorphic Readout Card (Antigravity Style)
      const tipX = modelCx + 55;
      const tipY = modelCy - ringRadius - 16;
      ctx.fillStyle = 'rgba(10, 16, 31, 0.88)';
      ctx.strokeStyle = isRotating ? '#00f0ff' : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.5;

      // Card box with rounded aesthetics
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(tipX - 44, tipY - 14, 88, 28, 8) : ctx.rect(tipX - 44, tipY - 14, 88, 28);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isRotating ? '#00f0ff' : '#38bdf8';
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`α ${params.angle_of_attack >= 0 ? '+' : ''}${params.angle_of_attack.toFixed(1)}°`, tipX, tipY);
      ctx.restore();
    }

    // Request next animation frame
    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, [params, telemetry, isPaused, isRotating, isHoveringModel]);

  // Start / restart render loop
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderLoop]);

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

  // Mouse & Touch Interaction for Direct Aircraft Rotation
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const basePolygon = getBasePolygon(params.modelType, params.flaps_deg);
    const chordPx = Math.min(canvas.clientWidth * 0.38, 280);
    const modelPolygon = transformModelPolygon(
      basePolygon,
      dragCenterRef.current.x,
      dragCenterRef.current.y,
      chordPx,
      params.angle_of_attack
    );

    const distToCenter = Math.hypot(x - dragCenterRef.current.x, y - dragCenterRef.current.y);
    const inPolygon = isPointInPolygon(x, y, modelPolygon);
    const nearRing = Math.abs(distToCenter - chordPx * 0.58) < 32;

    if (inPolygon || nearRing) {
      isDraggingModelRef.current = true;
      setIsRotating(true);
      dragStartAngleRef.current = Math.atan2(y - dragCenterRef.current.y, x - dragCenterRef.current.x);
      canvas.setPointerCapture(e.pointerId);
    } else {
      // Inflow dye injection where user clicks
      const solver = solverRef.current;
      if (solver) {
        const i = Math.floor((x / canvas.clientWidth) * solver.nx);
        const j = Math.floor((y / canvas.clientHeight) * solver.ny);
        if (i >= 1 && i <= solver.nx && j >= 1 && j <= solver.ny) {
          solver.dens[solver.IX(i, j)] = 25.0;
          solver.u[solver.IX(i, j)] += 2.0;
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDraggingModelRef.current) {
      const currentAngle = Math.atan2(y - dragCenterRef.current.y, x - dragCenterRef.current.x);
      const deltaAngle = currentAngle - dragStartAngleRef.current;
      dragStartAngleRef.current = currentAngle;

      // Negative because screen Y increases downward
      const deltaDeg = (-deltaAngle * 180) / Math.PI;
      const newAoa = Math.max(-20, Math.min(35, params.angle_of_attack + deltaDeg));
      onParamChange('angle_of_attack', Number(newAoa.toFixed(1)));
    } else {
      const basePolygon = getBasePolygon(params.modelType, params.flaps_deg);
      const chordPx = Math.min(canvas.clientWidth * 0.38, 280);
      const modelPolygon = transformModelPolygon(
        basePolygon,
        dragCenterRef.current.x,
        dragCenterRef.current.y,
        chordPx,
        params.angle_of_attack
      );
      const inModel = isPointInPolygon(x, y, modelPolygon);
      setIsHoveringModel(inModel);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDraggingModelRef.current) {
      isDraggingModelRef.current = false;
      setIsRotating(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <div className="relative w-full h-[400px] sm:h-[480px] lg:h-[520px] rounded-2xl overflow-hidden glass-panel select-none shadow-[0_20px_60px_rgba(0,0,0,0.65)] border border-cyan-500/20">
      {/* Corner Holographic Laser Brackets */}
      <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400 pointer-events-none z-10" />
      <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400 pointer-events-none z-10" />
      <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400 pointer-events-none z-10" />
      <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400 pointer-events-none z-10" />

      {/* 2D Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-full block ${isRotating ? 'cursor-grabbing' : isHoveringModel ? 'cursor-grab' : 'cursor-crosshair'}`}
        style={{ touchAction: 'none' }}
      />

      {/* Top Left: Floating Glass Aerospace Model Badge */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none z-20">
        <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-xl border border-cyan-500/40 shadow-lg shadow-cyan-950/40 flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-white font-sans tracking-wide">
            {AIRCRAFT_MODELS[params.modelType].name} (2D CFD Solver)
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-xs text-cyan-300 font-mono font-bold">
            α: {params.angle_of_attack >= 0 ? '+' : ''}{params.angle_of_attack.toFixed(1)}°
          </span>
        </div>

        {telemetry.isStalled && (
          <div className="px-3 py-1.5 rounded-xl bg-red-950/90 border border-red-500/80 shadow-lg shadow-red-950/60 flex items-center gap-1.5 animate-bounce">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-bold text-red-100 uppercase tracking-wider font-mono">
              STALL DETECTED
            </span>
          </div>
        )}

        {telemetry.mach >= 1.0 && (
          <div className="px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-500/80 shadow-lg flex items-center gap-1.5 animate-pulse">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-200 font-mono">
              SUPERSONIC M{telemetry.mach.toFixed(2)}
            </span>
          </div>
        )}

        {params.airspeed_kts >= 480 && (
          <div className="px-3 py-1.5 rounded-xl bg-orange-950/90 border border-orange-500/80 shadow-lg flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-400 animate-bounce" />
            <span className="text-xs font-bold text-orange-200 font-mono">
              AFTERBURNER ACTIVE
            </span>
          </div>
        )}
      </div>

      {/* Top Right: Floating Glass View Actions & Preset Snapping */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {/* Quick AoA Snap Chips */}
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-slate-950/80 backdrop-blur-xl border border-white/10 shadow-lg">
          {[
            { label: '0° Level', val: 0 },
            { label: '+4° Cruise', val: 4 },
            { label: '+12° Climb', val: 12 },
            { label: '+20° Stall', val: 20 },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => onParamChange('angle_of_attack', preset.val)}
              className={`px-2 py-1 text-xs font-medium rounded-lg transition-all ${
                Math.abs(params.angle_of_attack - preset.val) < 0.8
                  ? 'bg-cyan-500/25 text-cyan-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Force Vectors Toggle */}
        <button
          onClick={() => onParamChange('show_pressure_vectors', !params.show_pressure_vectors)}
          className={`p-2 rounded-xl backdrop-blur-xl border transition-all ${
            params.show_pressure_vectors
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-md shadow-cyan-950/40'
              : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-slate-200'
          }`}
          title={params.show_pressure_vectors ? 'Hide Surface Pressure Vectors' : 'Show Surface Pressure Vectors'}
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>

        {/* Audio Toggle */}
        <button
          onClick={() => onParamChange('audio_enabled', !params.audio_enabled)}
          className={`p-2 rounded-xl backdrop-blur-xl border transition-all ${
            params.audio_enabled
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-md shadow-cyan-950/40'
              : 'bg-slate-900/80 text-slate-400 border-white/10 hover:text-slate-200'
          }`}
          title={params.audio_enabled ? 'Mute Wind Tunnel Audio' : 'Enable Wind Tunnel Audio'}
        >
          {params.audio_enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Reset Flow Field */}
        <button
          onClick={() => {
            solverRef.current?.reset(Math.min(2.5, 0.4 + (params.airspeed_kts / 400) * 1.2));
          }}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-white/10 transition-colors shadow-sm"
          title="Reset Flow Field"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Floating Glass Legend & Telemetry Bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none text-xs text-slate-400 z-20">
        <div className="flex flex-wrap items-center gap-2.5 bg-slate-950/80 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-white/10 shadow-lg">
          <span className="text-slate-200 font-medium">Inflow: {params.airspeed_kts} kts</span>
          <span className="text-slate-600">·</span>
          <span className="text-cyan-400">Drag craft to pitch α</span>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-2 pl-1 border-l border-slate-800">
            <span className="w-2 h-2 rounded-full bg-cyan-400" title="Bernoulli Suction" />
            <span className="text-[11px] text-cyan-300 font-mono">Suction</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 ml-1" title="Dynamic Compression" />
            <span className="text-[11px] text-amber-300 font-mono">Compression</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2.5 bg-slate-950/80 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-white/10 shadow-lg">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400 font-mono font-semibold">L/D: {telemetry.ldRatio.toFixed(1)}:1</span>
          <span className="text-slate-600">·</span>
          <span className="text-cyan-300 font-mono">q: {(telemetry.dynamic_pressure_pa / 1000).toFixed(1)} kPa</span>
        </div>
      </div>
    </div>
  );
};
