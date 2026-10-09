import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimulationParams, AeroTelemetry } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import { getAircraft3DModel } from '../utils/aircraft3DGeometry';
import { windTunnelAudio } from '../utils/audio';
import { 
  RotateCw, 
  AlertTriangle, 
  Zap, 
  Volume2, 
  VolumeX, 
  Flame, 
  Compass, 
  Play, 
  Pause, 
  Layers, 
  Box, 
  Eye, 
  Maximize2 
} from 'lucide-react';

interface WindTunnelCanvasWebGLProps {
  params: SimulationParams;
  onParamChange: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  telemetry: AeroTelemetry;
  isPaused: boolean;
  onFallbackToCanvas?: () => void;
  onOpenModelInspector?: () => void;
}

export const WindTunnelCanvasWebGL: React.FC<WindTunnelCanvasWebGLProps> = ({
  params,
  onParamChange,
  telemetry,
  isPaused,
  onFallbackToCanvas,
  onOpenModelInspector,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Model & Simulation Roots
  const aircraftGroupRef = useRef<THREE.Group | null>(null);
  const glbRootRef = useRef<THREE.Group | null>(null);
  const proceduralMeshRef = useRef<THREE.Mesh | null>(null);
  const streamlinesGroupRef = useRef<THREE.Group | null>(null);
  const particlesPointsRef = useRef<THREE.Points | null>(null);
  const particlePositionsRef = useRef<Float32Array | null>(null);
  const particleVelocitiesRef = useRef<Float32Array | null>(null);
  const particleOriginalYRef = useRef<Float32Array | null>(null);
  const machConeMeshRef = useRef<THREE.Mesh | null>(null);
  const forceVectorsGroupRef = useRef<THREE.Group | null>(null);
  const afterburnerGroupRef = useRef<THREE.Group | null>(null);

  // UI state
  const [activePreset, setActivePreset] = useState<'iso' | 'side' | 'top' | 'front' | 'chase'>('iso');
  const [isAutoOrbit, setIsAutoOrbit] = useState<boolean>(false);
  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [activeShading, setActiveShading] = useState<'pbr' | 'wireframe' | 'cfdHeatmap' | 'xray'>('pbr');
  const [gearDeployed, setGearDeployed] = useState<boolean>(false);

  // Sync Audio with simulation speed & stall
  useEffect(() => {
    if (params.audio_enabled) {
      windTunnelAudio.start();
      windTunnelAudio.update(params.airspeed_kts, telemetry.mach, telemetry.isStalled);
    } else {
      windTunnelAudio.stop();
    }
  }, [params.audio_enabled, params.airspeed_kts, telemetry.mach, telemetry.isStalled]);

  // Main Three.js Scene Initialization
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 900;
    const height = mount.clientHeight || 560;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060a12);
    scene.fog = new THREE.FogExp2(0x060a12, 0.015);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 300);
    camera.position.set(-14, 7, 14);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 45;
    controls.minDistance = 3.5;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0x38bdf8, 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 2.4);
    keyLight.position.set(-18, 22, 16);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x0284c7, 1.6);
    rimLight.position.set(18, -10, -14);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x10b981, 0.6);
    fillLight.position.set(-5, -12, 0);
    scene.add(fillLight);

    // 6. Wind Tunnel Coordinate Grid Chamber Floor
    const gridFloor = new THREE.GridHelper(36, 36, 0x00f0ff, 0x1e3a5f);
    gridFloor.position.y = -4.5;
    scene.add(gridFloor);

    // Lateral guideline rails
    const railMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 });
    for (let rz of [-8, 8]) {
      const railGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-18, -4.5, rz),
        new THREE.Vector3(18, -4.5, rz),
      ]);
      scene.add(new THREE.Line(railGeo, railMat));
    }

    // 7. Aircraft Group (holds all models, rotates with AoA)
    const aircraftGroup = new THREE.Group();
    scene.add(aircraftGroup);
    aircraftGroupRef.current = aircraftGroup;

    // Afterburner exhaust group
    const abGroup = new THREE.Group();
    aircraftGroup.add(abGroup);
    afterburnerGroupRef.current = abGroup;

    // Twin afterburner flame light & cones
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.85,
    });
    for (const zOff of [-0.67, 0.67]) {
      const coneGeo = new THREE.ConeGeometry(0.32, 2.4, 16);
      coneGeo.rotateZ(-Math.PI / 2); // point exhaust downstream (+X)
      const flameMesh = new THREE.Mesh(coneGeo, flameMat);
      flameMesh.position.set(6.8 + 1.2, -0.38, zOff);
      abGroup.add(flameMesh);

      const flameLight = new THREE.PointLight(0xf97316, 2.0, 8);
      flameLight.position.set(6.8, -0.38, zOff);
      abGroup.add(flameLight);
    }
    abGroup.visible = false;

    // 8. Load High-Fidelity F-22 GLB Asset
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      '/models/f-22_raptor_-_fighter_jet_-_free.glb',
      (gltf) => {
        const root = gltf.scene;

        // Centering & scaling math:
        // Length along X = 189.95, Center = [40.45, 11.05, 0]
        const scale = 13.5 / 189.95;
        root.scale.set(scale, scale, scale);
        root.position.set(-40.45 * scale, -11.05 * scale, 0);

        // Turn jet so nose points into wind (towards -X)
        const innerWrapper = new THREE.Group();
        innerWrapper.rotation.y = Math.PI;
        innerWrapper.add(root);

        // Configure realistic glass canopy
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.name === 'Object_6') {
              mesh.material = new THREE.MeshPhysicalMaterial({
                color: 0x94a3b8,
                metalness: 0.1,
                roughness: 0.05,
                transmission: 0.9,
                transparent: true,
                opacity: 0.7,
                ior: 1.52,
              });
            }
          }
        });

        glbRootRef.current = innerWrapper;
        aircraftGroup.add(innerWrapper);
        setModelLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => {
        console.error('Failed to load GLB model in WebGL canvas:', err);
        setModelLoading(false);
      }
    );

    // 9. Particle Flow System (900 Speed Streak Particles)
    const particleCount = 900;
    const pPositions = new Float32Array(particleCount * 3);
    const pVelocities = new Float32Array(particleCount);
    const pOrigY = new Float32Array(particleCount);
    const pColors = new Float32Array(particleCount * 3);

    const colorPalette = [
      new THREE.Color('#00f0ff'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#10b981'),
      new THREE.Color('#fbbf24'),
    ];

    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = -20 + Math.random() * 40;
      const y = -4 + Math.random() * 8;
      pPositions[i * 3 + 1] = y;
      pOrigY[i] = y;
      pPositions[i * 3 + 2] = -7 + Math.random() * 14;
      pVelocities[i] = 0.35 + Math.random() * 0.25;

      const c = colorPalette[i % colorPalette.length];
      pColors[i * 3] = c.r;
      pColors[i * 3 + 1] = c.g;
      pColors[i * 3 + 2] = c.b;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);
    particlesPointsRef.current = particles;
    particlePositionsRef.current = pPositions;
    particleVelocitiesRef.current = pVelocities;
    particleOriginalYRef.current = pOrigY;

    // 10. Smoke Streamlines Group
    const streamlinesGroup = new THREE.Group();
    scene.add(streamlinesGroup);
    streamlinesGroupRef.current = streamlinesGroup;

    // 11. Supersonic Shockwave Cone Mesh
    const coneRadius = 6.0;
    const coneHeight = 16.0;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);
    coneGeo.rotateZ(Math.PI / 2); // Apex at nose (-X), expands towards +X
    coneGeo.translate(coneHeight / 2 - 6.7, 0, 0); // anchor apex at nose tip (~ -6.7)
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const machConeMesh = new THREE.Mesh(coneGeo, coneMat);
    machConeMesh.visible = false;
    scene.add(machConeMesh);
    machConeMeshRef.current = machConeMesh;

    // 12. Spatial 3D Force Vectors Group (Lift & Drag)
    const forceGroup = new THREE.Group();
    scene.add(forceGroup);
    forceVectorsGroupRef.current = forceGroup;

    // Lift arrow (Emerald green, points +Y)
    const liftArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      3.5,
      0x10b981,
      0.6,
      0.35
    );
    liftArrow.name = 'liftArrow';
    forceGroup.add(liftArrow);

    // Drag arrow (Solar amber, points +X downstream)
    const dragArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      1.8,
      0xf59e0b,
      0.45,
      0.25
    );
    dragArrow.name = 'dragArrow';
    forceGroup.add(dragArrow);

    // 13. Animation Loop
    let lastTime = performance.now();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Auto-Orbit Flyaround
      if (isAutoOrbit && controlsRef.current) {
        controlsRef.current.autoRotate = true;
        controlsRef.current.autoRotateSpeed = 1.2;
      } else if (controlsRef.current) {
        controlsRef.current.autoRotate = false;
      }

      // Update Flow Particles
      if (particlePositionsRef.current && particlesPointsRef.current) {
        const pos = particlePositionsRef.current;
        const vel = particleVelocitiesRef.current!;
        const origY = particleOriginalYRef.current!;
        const speedMult = (params.airspeed_kts / 350) * 1.5;

        for (let i = 0; i < particleCount; i++) {
          if (!isPaused) {
            pos[i * 3] += vel[i] * speedMult * 0.4;
          }

          // Flow deflection around jet body
          const px = pos[i * 3];
          if (px > -7 && px < 7) {
            // Deflect above/below body
            if (origY[i] > 0) {
              pos[i * 3 + 1] = origY[i] + 0.35 * Math.sin(((px + 7) / 14) * Math.PI);
            }
          } else {
            pos[i * 3 + 1] = origY[i];
          }

          // Reset particle if exited downstream chamber
          if (pos[i * 3] > 20) {
            pos[i * 3] = -20;
            pos[i * 3 + 1] = -4 + Math.random() * 8;
            origY[i] = pos[i * 3 + 1];
            pos[i * 3 + 2] = -7 + Math.random() * 14;
          }
        }
        particlesPointsRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Update Shockwave Cone Pulsing
      if (machConeMeshRef.current && machConeMeshRef.current.visible) {
        const pulse = 1.0 + Math.sin(now * 0.008) * 0.05;
        machConeMeshRef.current.scale.set(pulse, pulse, pulse);
      }

      // Update Afterburner Pulse
      if (afterburnerGroupRef.current && afterburnerGroupRef.current.visible) {
        const abPulse = 0.8 + Math.random() * 0.4;
        afterburnerGroupRef.current.scale.set(abPulse, 1, 1);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 14. Resize Observer
    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
      mount.innerHTML = '';
    };
  }, []);

  // Update Dynamic Aircraft Pitch (Angle of Attack + Buffet Shaking)
  useEffect(() => {
    if (!aircraftGroupRef.current) return;

    const now = Date.now();
    const buffetShake = telemetry.isStalled
      ? Math.sin(now * 0.04) * 1.5 + Math.cos(now * 0.07) * 0.95
      : (params.angle_of_attack > 14 ? Math.sin(now * 0.03) * 0.28 : 0);

    const activeAoA = params.angle_of_attack + buffetShake;
    const pitchRad = (activeAoA * Math.PI) / 180;

    // When nose is at -X, pitching nose UP (+Y) is rotation around Z by -pitchRad
    aircraftGroupRef.current.rotation.z = -pitchRad;
  }, [params.angle_of_attack, telemetry.isStalled]);

  // Update Landing Gear on F-22 GLB model
  useEffect(() => {
    if (!glbRootRef.current) return;
    glbRootRef.current.traverse((obj) => {
      if (obj.name === 'Object_14' || obj.name === 'F-22-landingOff_5') {
        obj.visible = !gearDeployed;
      }
      if (
        obj.name === 'Object_16' ||
        obj.name === 'F-22-landingOn_6' ||
        obj.name === 'Object_18' ||
        obj.name === 'F-22-landingOnLight_7'
      ) {
        obj.visible = gearDeployed;
      }
    });
  }, [gearDeployed]);

  // Update Shading Mode (PBR, Wireframe, CFD Heatmap, X-Ray)
  useEffect(() => {
    if (!glbRootRef.current) return;
    glbRootRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === 'Object_6') return; // keep glass canopy

        if (activeShading === 'wireframe') {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => {
              if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = true;
            });
          } else if (mesh.material && 'wireframe' in mesh.material) {
            (mesh.material as THREE.MeshStandardMaterial).wireframe = true;
          }
        } else if (activeShading === 'xray') {
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: 0x00f0ff,
            wireframe: false,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1,
            metalness: 0.8,
          });
        } else if (activeShading === 'cfdHeatmap') {
          // Heatmap: Suction peak cyan on top, stall crimson
          const heatColor = telemetry.isStalled ? 0xef4444 : (telemetry.cl > 1.2 ? 0x00f0ff : 0x10b981);
          mesh.material = new THREE.MeshStandardMaterial({
            color: heatColor,
            roughness: 0.3,
            metalness: 0.2,
          });
        } else {
          // Default PBR
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => {
              if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = false;
            });
          } else if (mesh.material && 'wireframe' in mesh.material) {
            (mesh.material as THREE.MeshStandardMaterial).wireframe = false;
          }
        }
      }
    });
  }, [activeShading, telemetry.isStalled, telemetry.cl]);

  // Update Mach Shockwave Cone
  useEffect(() => {
    if (!machConeMeshRef.current) return;
    const isSupersonic = telemetry.mach >= 1.0 && params.show_shockwaves;
    machConeMeshRef.current.visible = isSupersonic;

    if (isSupersonic) {
      // Mach angle mu = asin(1 / M)
      const mu = Math.asin(1 / Math.max(1.001, telemetry.mach));
      const coneHeight = 16.0;
      const baseRadius = coneHeight * Math.tan(mu);
      machConeMeshRef.current.geometry.dispose();
      const newGeo = new THREE.ConeGeometry(baseRadius, coneHeight, 32, 1, true);
      newGeo.rotateZ(Math.PI / 2);
      newGeo.translate(coneHeight / 2 - 6.7, 0, 0);
      machConeMeshRef.current.geometry = newGeo;
    }
  }, [telemetry.mach, params.show_shockwaves]);

  // Update Afterburner Flame
  useEffect(() => {
    if (!afterburnerGroupRef.current) return;
    afterburnerGroupRef.current.visible = params.airspeed_kts > 450;
  }, [params.airspeed_kts]);

  // Update Force Vectors (Lift & Drag)
  useEffect(() => {
    if (!forceVectorsGroupRef.current) return;
    forceVectorsGroupRef.current.visible = params.show_pressure_vectors;

    const liftArrow = forceVectorsGroupRef.current.getObjectByName('liftArrow') as THREE.ArrowHelper;
    const dragArrow = forceVectorsGroupRef.current.getObjectByName('dragArrow') as THREE.ArrowHelper;

    if (liftArrow) {
      // Dynamic lift length scaling
      const liftLen = Math.max(0.5, Math.min(8.0, (telemetry.lift_N / 120000) * 4.0));
      liftArrow.setLength(liftLen, 0.6, 0.35);
      liftArrow.setColor(telemetry.isStalled ? new THREE.Color(0xef4444) : new THREE.Color(0x10b981));
    }

    if (dragArrow) {
      const dragLen = Math.max(0.4, Math.min(6.0, (telemetry.drag_N / 40000) * 3.5));
      dragArrow.setLength(dragLen, 0.45, 0.25);
    }
  }, [telemetry.lift_N, telemetry.drag_N, telemetry.isStalled, params.show_pressure_vectors]);

  // Update Dynamic Smoke Streamlines
  useEffect(() => {
    if (!streamlinesGroupRef.current) return;
    streamlinesGroupRef.current.clear();

    if (!params.show_streamlines) return;

    const linesGroup = streamlinesGroupRef.current;
    const spanOffsets = [-4.5, -3.0, -1.5, 0, 1.5, 3.0, 4.5];
    const downwashAngle = (2 * telemetry.cl) / (Math.PI * 7.5); // rad
    const downwashDrop = Math.tan(downwashAngle) * 12;

    spanOffsets.forEach((z) => {
      const points: THREE.Vector3[] = [];
      const numPts = 30;

      for (let i = 0; i <= numPts; i++) {
        const x = -18 + (i / numPts) * 36;
        let y = 0.5;

        // Flow curvature over wing
        if (x >= -6 && x <= 4) {
          const frac = (x + 6) / 10;
          y += Math.sin(frac * Math.PI) * 1.1 * Math.max(0.2, telemetry.cl);
        } else if (x > 4) {
          // Downwash trajectory
          const aftFrac = (x - 4) / 14;
          y -= aftFrac * downwashDrop;
        }

        points.push(new THREE.Vector3(x, y, z));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.05, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: telemetry.isStalled ? 0xef4444 : 0x00f0ff,
        transparent: true,
        opacity: 0.65,
      });
      linesGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
    });
  }, [params.show_streamlines, telemetry.cl, telemetry.isStalled]);

  // Camera Presets
  const setCameraPreset = (preset: 'iso' | 'side' | 'top' | 'front' | 'chase') => {
    setActivePreset(preset);
    setIsAutoOrbit(false);
    if (!cameraRef.current || !controlsRef.current) return;

    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    ctrl.target.set(0, 0, 0);

    switch (preset) {
      case 'iso':
        cam.position.set(-14, 7, 14);
        break;
      case 'side':
        cam.position.set(0, 1, 18);
        break;
      case 'top':
        cam.position.set(0, 20, 0.001);
        break;
      case 'front':
        cam.position.set(-18, 1, 0);
        break;
      case 'chase':
        cam.position.set(18, 4, 0);
        break;
    }
    ctrl.update();
  };

  return (
    <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9] lg:aspect-[21/9] max-h-[640px] rounded-3xl overflow-hidden border border-cyan-500/30 bg-[#060a12] shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col group select-none">
      
      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Model Loading Spinner / Progress */}
      {modelLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md gap-3 z-20">
          <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-cyan-200 font-mono">
              Loading F-22 Raptor 3D CAD Asset... {loadProgress}%
            </span>
            <div className="w-40 h-1.5 rounded-full bg-slate-800 overflow-hidden border border-cyan-500/30">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-all duration-200"
                style={{ width: `${Math.max(8, loadProgress)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400">26.57 MB Photorealistic PBR Mesh</span>
          </div>
        </div>
      )}

      {/* Top Header Floating Status Pill */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-cyan-500/30 pointer-events-auto shadow-lg">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
          <span className="text-xs font-bold text-white tracking-wide">
            WebGL Three.js Wind Tunnel
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
            F-22 GLB 3D
          </span>
          {telemetry.isStalled && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              STALL
            </span>
          )}
        </div>

        {/* Top-Right Quick Action Toolbar */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {onOpenModelInspector && (
            <button
              onClick={onOpenModelInspector}
              className="px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-950/50"
              title="Open 3D CAD Asset Inspector"
            >
              <Box className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="hidden sm:inline">Inspect 3D CAD</span>
            </button>
          )}

          <div className="flex items-center bg-slate-950/80 backdrop-blur-md p-1 rounded-2xl border border-cyan-500/30">
            <button
              onClick={() => onParamChange('audio_enabled', !params.audio_enabled)}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all"
              title={params.audio_enabled ? 'Mute Procedural Wind Sound' : 'Enable Wind Audio'}
            >
              {params.audio_enabled ? (
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>

            {onFallbackToCanvas && (
              <button
                onClick={onFallbackToCanvas}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-cyan-200 transition-colors border-l border-white/10 ml-1"
                title="Switch to 2D Canvas Engine"
              >
                2D Engine
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Floating Controls Overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
        
        {/* Left: Camera Presets & Orbit */}
        <div className="flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 pointer-events-auto shadow-lg">
          {(['iso', 'side', 'top', 'front', 'chase'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setCameraPreset(p)}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold capitalize transition-all ${
                activePreset === p && !isAutoOrbit
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}

          <div className="w-px h-4 bg-white/15 mx-0.5" />

          <button
            onClick={() => setIsAutoOrbit(!isAutoOrbit)}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
              isAutoOrbit
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Toggle 360 Cinematic Flyaround"
          >
            <RotateCw className={`w-3 h-3 ${isAutoOrbit ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Orbit</span>
          </button>
        </div>

        {/* Right: Shading & Gear Toggles */}
        <div className="flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 pointer-events-auto shadow-lg">
          {/* Shading mode */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'pbr', label: 'PBR' },
                { id: 'wireframe', label: 'Wire' },
                { id: 'cfdHeatmap', label: 'CFD' },
                { id: 'xray', label: 'X-Ray' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveShading(s.id)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all ${
                  activeShading === s.id
                    ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-white/15 mx-0.5" />

          {/* Landing gear toggle */}
          <button
            onClick={() => setGearDeployed(!gearDeployed)}
            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all border ${
              gearDeployed
                ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Toggle Landing Gear Configuration"
          >
            {gearDeployed ? 'Gear: Down' : 'Gear: Up'}
          </button>
        </div>
      </div>

      {/* Floating Spatial Force Labels */}
      {params.show_pressure_vectors && (
        <div className="absolute top-14 left-4 pointer-events-none z-10 flex flex-col gap-1 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-emerald-500/40 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>LIFT: {(telemetry.lift_N / 1000).toFixed(1)} kN</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-amber-500/40 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>DRAG: {(telemetry.drag_N / 1000).toFixed(1)} kN</span>
          </div>
        </div>
      )}

    </div>
  );
};
