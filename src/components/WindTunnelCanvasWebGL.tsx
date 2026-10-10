import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimulationParams, AeroTelemetry } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import { getAircraft3DModel } from '../utils/aircraft3DGeometry';
import { 
  loadGlbAircraftModel, 
  GLB_MODEL_REGISTRY, 
  applyCfdPressureHeatmap, 
  restoreOriginalGlbMaterials, 
  applyWireframeShading, 
  createAeroForceVectorsGroup, 
  updateAeroForceVectors 
} from '../utils/aircraftGlbModels';
import { FluidDynamics3D, Fluid3DParams } from '../engine/FluidDynamics3D';
import { windTunnelAudio } from '../utils/audio';
import { 
  RotateCw, 
  AlertTriangle, 
  Volume2, 
  VolumeX, 
  Layers, 
  Box, 
  Camera, 
  Flame, 
  Eye, 
  Sun,
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
  const machConeMeshRef = useRef<THREE.Mesh | null>(null);
  const forceVectorsGroupRef = useRef<THREE.Group | null>(null);
  const afterburnerGroupRef = useRef<THREE.Group | null>(null);
  const lightsGroupRef = useRef<THREE.Group | null>(null);

  // UI state
  const [activePreset, setActivePreset] = useState<'iso' | 'side' | 'top' | 'front' | 'chase'>('iso');
  const [isAutoOrbit, setIsAutoOrbit] = useState<boolean>(false);
  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeShading, setActiveShading] = useState<'pbr' | 'wireframe' | 'cfdHeatmap' | 'xray'>('pbr');
  const [gearDeployed, setGearDeployed] = useState<boolean>(false);
  const [activeLighting, setActiveLighting] = useState<'tunnel' | 'studio' | 'sunset' | 'cyber'>('tunnel');

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
    scene.fog = new THREE.FogExp2(0x060a12, 0.012);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 400);
    camera.position.set(-15, 7.5, 15);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 50;
    controls.minDistance = 3.5;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Lighting System
    const lightsGroup = new THREE.Group();
    scene.add(lightsGroup);
    lightsGroupRef.current = lightsGroup;

    const applyLighting = (preset: 'tunnel' | 'studio' | 'sunset' | 'cyber') => {
      lightsGroup.clear();
      if (preset === 'tunnel') {
        lightsGroup.add(new THREE.AmbientLight(0x38bdf8, 0.7));
        const key = new THREE.DirectionalLight(0xe0f2fe, 2.5);
        key.position.set(-18, 22, 16);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0x0284c7, 1.8);
        rim.position.set(18, -10, -14);
        lightsGroup.add(rim);
        const fill = new THREE.DirectionalLight(0x10b981, 0.6);
        fill.position.set(-5, -12, 0);
        lightsGroup.add(fill);
      } else if (preset === 'studio') {
        lightsGroup.add(new THREE.AmbientLight(0xffffff, 1.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.8);
        key.position.set(12, 24, 12);
        lightsGroup.add(key);
        const fill = new THREE.DirectionalLight(0xf1f5f9, 1.5);
        fill.position.set(-12, 10, -12);
        lightsGroup.add(fill);
      } else if (preset === 'sunset') {
        lightsGroup.add(new THREE.AmbientLight(0xf59e0b, 0.8));
        const key = new THREE.DirectionalLight(0xf97316, 3.2);
        key.position.set(-20, 12, 6);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0x7c3aed, 1.8);
        rim.position.set(20, -5, -10);
        lightsGroup.add(rim);
      } else {
        // Cyberpunk
        lightsGroup.add(new THREE.AmbientLight(0x06b6d4, 0.8));
        const key = new THREE.DirectionalLight(0x00f0ff, 2.6);
        key.position.set(-15, 18, 12);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0xf43f5e, 2.6);
        rim.position.set(15, -10, -15);
        lightsGroup.add(rim);
      }
    };
    applyLighting(activeLighting);

    // 6. Chamber Floor Grid
    const gridFloor = new THREE.GridHelper(36, 36, 0x00f0ff, 0x1e3a5f);
    gridFloor.position.y = -4.5;
    scene.add(gridFloor);

    // Lateral rails
    const railMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 });
    for (let rz of [-8, 8]) {
      const railGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-18, -4.5, rz),
        new THREE.Vector3(18, -4.5, rz),
      ]);
      scene.add(new THREE.Line(railGeo, railMat));
    }

    // 7. Aircraft Root Group (holds models and pitches with AoA)
    const aircraftGroup = new THREE.Group();
    aircraftGroup.name = 'AircraftGroup';
    scene.add(aircraftGroup);
    aircraftGroupRef.current = aircraftGroup;

    // Afterburner exhaust group
    const abGroup = new THREE.Group();
    aircraftGroup.add(abGroup);
    afterburnerGroupRef.current = abGroup;

    for (const zOff of [-0.67, 0.67]) {
      const coneGeo = new THREE.ConeGeometry(0.32, 2.4, 16);
      coneGeo.rotateZ(-Math.PI / 2);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.85 });
      const flameMesh = new THREE.Mesh(coneGeo, flameMat);
      flameMesh.position.set(6.8 + 1.2, -0.38, zOff);
      abGroup.add(flameMesh);

      const flameLight = new THREE.PointLight(0xf97316, 2.0, 8);
      flameLight.position.set(6.8, -0.38, zOff);
      abGroup.add(flameLight);
    }
    abGroup.visible = false;

    // 8. Flow Particles System
    const particleCount = 850;
    const pPositions = new Float32Array(particleCount * 3);
    const pVelocities = new Float32Array(particleCount);
    const pColors = new Float32Array(particleCount * 3);

    const palette = [
      new THREE.Color('#00f0ff'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#10b981'),
      new THREE.Color('#fbbf24'),
    ];

    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = -22 + Math.random() * 44;
      pPositions[i * 3 + 1] = -4 + Math.random() * 8;
      pPositions[i * 3 + 2] = -7 + Math.random() * 14;
      pVelocities[i] = 0.35 + Math.random() * 0.25;

      const c = palette[i % palette.length];
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

    // 9. Streamlines Group
    const streamlinesGroup = new THREE.Group();
    scene.add(streamlinesGroup);
    streamlinesGroupRef.current = streamlinesGroup;

    // 10. Supersonic Mach Shockwave Cone
    const coneRadius = 6.0;
    const coneHeight = 16.0;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);
    coneGeo.rotateZ(Math.PI / 2);
    coneGeo.translate(coneHeight / 2 - 6.7, 0, 0);
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

    // 11. Aerodynamic 3D Force Vectors (Lift, Drag, Resultant, CP Ring)
    const forceGroup = createAeroForceVectorsGroup();
    scene.add(forceGroup);
    forceVectorsGroupRef.current = forceGroup;

    // 12. Animation Loop
    let lastTime = performance.now();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (isAutoOrbit && controlsRef.current) {
        controlsRef.current.autoRotate = true;
        controlsRef.current.autoRotateSpeed = 1.2;
      } else if (controlsRef.current) {
        controlsRef.current.autoRotate = false;
      }

      // Update Flow Particles
      if (particlePositionsRef.current && particlesPointsRef.current && params.show_particles) {
        const pos = particlePositionsRef.current;
        const colorAttr = particlesPointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
        const fluid3DParams: Fluid3DParams = {
          modelType: params.modelType,
          aoaDeg: params.angle_of_attack,
          airspeed_kts: params.airspeed_kts,
          mach: telemetry.mach,
          altitude_ft: params.altitude_ft,
          flapsDeg: params.flaps_deg,
          isStalled: telemetry.isStalled,
          cl: telemetry.cl,
          cd: telemetry.cd,
          timeSec: now * 0.001,
        };

        for (let i = 0; i < particleCount; i++) {
          const px = pos[i * 3];
          const py = pos[i * 3 + 1];
          const pz = pos[i * 3 + 2];

          if (!isPaused) {
            const vel3D = FluidDynamics3D.getVelocity({ x: px, y: py, z: pz }, fluid3DParams);
            pos[i * 3] += vel3D.u * 0.38;
            pos[i * 3 + 1] += vel3D.v * 0.38;
            pos[i * 3 + 2] += vel3D.w * 0.38;

            if (colorAttr) {
              if (vel3D.isSeparated || (telemetry.isStalled && px > -1.0)) {
                colorAttr.setXYZ(i, 0.94, 0.27, 0.27);
              } else if (vel3D.pressureCoeff < -0.7) {
                colorAttr.setXYZ(i, 0.0, 0.94, 1.0);
              } else if (vel3D.pressureCoeff > 0.3) {
                colorAttr.setXYZ(i, 0.98, 0.75, 0.14);
              }
            }
          }

          if (pos[i * 3] > 22 || Math.abs(pos[i * 3 + 1]) > 8 || Math.abs(pos[i * 3 + 2]) > 13) {
            pos[i * 3] = -22;
            pos[i * 3 + 1] = -4 + Math.random() * 8;
            pos[i * 3 + 2] = -7 + Math.random() * 14;
          }
        }
        particlesPointsRef.current.geometry.attributes.position.needsUpdate = true;
        if (colorAttr) colorAttr.needsUpdate = true;
      }

      if (machConeMeshRef.current && machConeMeshRef.current.visible) {
        const pulse = 1.0 + Math.sin(now * 0.008) * 0.04;
        machConeMeshRef.current.scale.set(pulse, pulse, pulse);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
      mount.innerHTML = '';
    };
  }, []);

  // Dynamic 3D GLB Model Loading on modelType change
  useEffect(() => {
    if (!aircraftGroupRef.current) return;
    const aircraftGroup = aircraftGroupRef.current;

    // Remove existing GLB / procedural meshes
    if (glbRootRef.current) {
      aircraftGroup.remove(glbRootRef.current);
      glbRootRef.current = null;
    }
    if (proceduralMeshRef.current) {
      aircraftGroup.remove(proceduralMeshRef.current);
      proceduralMeshRef.current = null;
    }

    setModelLoading(true);
    setLoadProgress(0);
    setLoadError(null);

    const isGlbAvailable = !!GLB_MODEL_REGISTRY[params.modelType];

    if (isGlbAvailable) {
      loadGlbAircraftModel(params.modelType, (pct) => setLoadProgress(pct))
        .then(({ root }) => {
          if (!aircraftGroupRef.current) return;
          glbRootRef.current = root;
          aircraftGroupRef.current.add(root);
          setModelLoading(false);

          // Apply initial shading mode
          if (activeShading === 'cfdHeatmap' || params.show_heatmap) {
            applyCfdPressureHeatmap(root, params.angle_of_attack, telemetry.isStalled);
          } else if (activeShading === 'wireframe') {
            applyWireframeShading(root, true);
          }
        })
        .catch((err) => {
          console.error('Failed to load GLB model, falling back to procedural:', err);
          setLoadError('Falling back to precision procedural mesh');
          loadProceduralFallback();
        });
    } else {
      loadProceduralFallback();
    }

    function loadProceduralFallback() {
      const meshData = getAircraft3DModel(params.modelType, params.flaps_deg, params.angle_of_attack, params.airspeed_kts, telemetry.lift_N);
      const geom = new THREE.BufferGeometry();
      const positions: number[] = [];
      const colors: number[] = [];

      for (const face of meshData.faces) {
        const c = new THREE.Color(face.baseColor || '#38bdf8');
        const idx = face.indices;
        for (let i = 1; i < idx.length - 1; i++) {
          const v0 = meshData.vertices[idx[0]];
          const v1 = meshData.vertices[idx[i]];
          const v2 = meshData.vertices[idx[i + 1]];
          positions.push(v0.x, v0.y, v0.z);
          positions.push(v1.x, v1.y, v1.z);
          positions.push(v2.x, v2.y, v2.z);
          colors.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }

      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geom.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.35,
        metalness: 0.5,
        side: THREE.DoubleSide,
      });

      const procMesh = new THREE.Mesh(geom, mat);
      proceduralMeshRef.current = procMesh;
      aircraftGroup.add(procMesh);
      setModelLoading(false);
    }
  }, [params.modelType]);

  // Update Dynamic Aircraft Pitch (AoA + Stall Buffet Shake)
  useEffect(() => {
    if (!aircraftGroupRef.current) return;
    const now = Date.now();
    const buffetShake = telemetry.isStalled
      ? Math.sin(now * 0.04) * 1.5 + Math.cos(now * 0.07) * 0.95
      : (params.angle_of_attack > 14 ? Math.sin(now * 0.03) * 0.28 : 0);

    const activeAoA = params.angle_of_attack + buffetShake;
    const pitchRad = (activeAoA * Math.PI) / 180;
    aircraftGroupRef.current.rotation.z = -pitchRad;
  }, [params.angle_of_attack, telemetry.isStalled]);

  // Update Shading Mode (PBR, Wireframe, CFD Heatmap, X-Ray)
  useEffect(() => {
    if (!glbRootRef.current) return;
    const root = glbRootRef.current;

    if (activeShading === 'cfdHeatmap' || params.show_heatmap) {
      applyCfdPressureHeatmap(root, params.angle_of_attack, telemetry.isStalled);
    } else if (activeShading === 'wireframe') {
      restoreOriginalGlbMaterials(root);
      applyWireframeShading(root, true);
    } else if (activeShading === 'xray') {
      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1,
            metalness: 0.8,
          });
        }
      });
    } else {
      // Default PBR
      restoreOriginalGlbMaterials(root);
      applyWireframeShading(root, false);
    }
  }, [activeShading, params.show_heatmap, params.angle_of_attack, telemetry.isStalled]);

  // Update Mach Shockwave Cone
  useEffect(() => {
    if (!machConeMeshRef.current) return;
    const isSupersonic = telemetry.mach >= 1.0 && params.show_shockwaves;
    machConeMeshRef.current.visible = isSupersonic;

    if (isSupersonic) {
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

  // Update Afterburner Flame for supersonic aircraft
  useEffect(() => {
    if (!afterburnerGroupRef.current) return;
    const config = AIRCRAFT_MODELS[params.modelType];
    const isReheatActive = config.supersonicCapable && params.airspeed_kts > 480;
    afterburnerGroupRef.current.visible = isReheatActive;
  }, [params.modelType, params.airspeed_kts]);

  // Update Force Vectors Overlay
  useEffect(() => {
    if (!forceVectorsGroupRef.current) return;
    updateAeroForceVectors(
      forceVectorsGroupRef.current,
      telemetry.lift_N,
      telemetry.drag_N,
      params.angle_of_attack,
      params.show_pressure_vectors
    );
  }, [telemetry.lift_N, telemetry.drag_N, params.angle_of_attack, params.show_pressure_vectors]);

  // Update Dynamic Smoke Streamlines (Passing around 3D GLB model)
  useEffect(() => {
    if (!streamlinesGroupRef.current) return;
    streamlinesGroupRef.current.clear();
    if (!params.show_streamlines) return;

    const linesGroup = streamlinesGroupRef.current;
    const spanOffsets = [-5.2, -3.6, -2.0, -0.6, 0.6, 2.0, 3.6, 5.2];
    const rakeHeights = [-1.4, 0.3, 1.5];

    const fluid3DParams: Fluid3DParams = {
      modelType: params.modelType,
      aoaDeg: params.angle_of_attack,
      airspeed_kts: params.airspeed_kts,
      mach: telemetry.mach,
      altitude_ft: params.altitude_ft,
      flapsDeg: params.flaps_deg,
      isStalled: telemetry.isStalled,
      cl: telemetry.cl,
      cd: telemetry.cd,
      timeSec: Date.now() * 0.001,
    };

    spanOffsets.forEach((z) => {
      rakeHeights.forEach((y) => {
        const startPt = { x: -20, y, z };
        const pts3D = FluidDynamics3D.traceStreamline(startPt, fluid3DParams, 38, 1.1);

        if (pts3D.length > 3) {
          const points = pts3D.map((p) => new THREE.Vector3(p.x, p.y, p.z));
          const curve = new THREE.CatmullRomCurve3(points);
          const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.045, 6, false);

          const isSeparatedFilament = pts3D.some((p) => p.isSeparated);
          const tubeColor = isSeparatedFilament || (telemetry.isStalled && y > 0.0)
            ? 0xef4444
            : (y > 0.5 ? 0x00f0ff : 0x10b981);

          const tubeMat = new THREE.MeshBasicMaterial({
            color: tubeColor,
            transparent: true,
            opacity: 0.68,
          });
          linesGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
        }
      });
    });
  }, [params.show_streamlines, params.modelType, params.angle_of_attack, params.airspeed_kts, telemetry.cl, telemetry.isStalled]);

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
        cam.position.set(-15, 7.5, 15);
        break;
      case 'side':
        cam.position.set(0, 1, 18);
        break;
      case 'top':
        cam.position.set(0, 22, 0.001);
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

  // Snapshot
  const handleTakeSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `cfd-${params.modelType}-simulation-${Date.now()}.png`;
    a.click();
  };

  const currentMeta = GLB_MODEL_REGISTRY[params.modelType];

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden border border-cyan-500/30 bg-[#060a12] shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col group select-none">
      
      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Model Loading Spinner / Progress */}
      {modelLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md gap-3.5 z-20">
          <div className="w-14 h-14 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin shadow-[0_0_20px_rgba(6,182,212,0.4)]" />
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-sm font-semibold text-cyan-200 font-mono tracking-wide">
              Loading {currentMeta ? currentMeta.name : '3D CAD Model'}... {loadProgress}%
            </span>
            <div className="w-48 h-2 rounded-full bg-slate-800 overflow-hidden border border-cyan-500/30">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400 transition-all duration-200"
                style={{ width: `${Math.max(8, loadProgress)}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {currentMeta ? `${currentMeta.fileSizeLabel} · ${currentMeta.meshCountLabel}` : 'Parsing 3D CAD geometry'}
            </span>
          </div>
        </div>
      )}

      {/* Top Header Floating Status Pill */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-cyan-500/30 pointer-events-auto shadow-lg">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
          <span className="text-xs font-bold text-white tracking-wide">
            CFD 3D Wind Tunnel
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
            {currentMeta ? currentMeta.name : AIRCRAFT_MODELS[params.modelType].name}
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
              <span className="hidden sm:inline">3D Inspector</span>
            </button>
          )}

          <button
            onClick={handleTakeSnapshot}
            className="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-cyan-500/30 text-slate-300 hover:text-white transition-all shadow-md"
            title="Save CFD PNG Snapshot"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          <div className="flex items-center bg-slate-950/80 backdrop-blur-md p-1 rounded-2xl border border-cyan-500/30">
            <button
              onClick={() => onParamChange('audio_enabled', !params.audio_enabled)}
              className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all"
              title={params.audio_enabled ? 'Mute Wind Sound' : 'Enable Wind Audio'}
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
                title="Switch to Canvas 3D Engine"
              >
                Canvas 3D
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Floating Controls Overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
        
        {/* Left: Camera Presets & Turntable */}
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
            title="Toggle 360 Turntable Orbit"
          >
            <RotateCw className={`w-3 h-3 ${isAutoOrbit ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Orbit</span>
          </button>
        </div>

        {/* Right: Shading & Heatmap Overlays */}
        <div className="flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 pointer-events-auto shadow-lg">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'pbr', label: 'PBR' },
                { id: 'cfdHeatmap', label: 'CFD Heat' },
                { id: 'wireframe', label: 'Wire' },
                { id: 'xray', label: 'X-Ray' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveShading(s.id);
                  if (s.id === 'cfdHeatmap') onParamChange('show_heatmap', true);
                  else if (s.id === 'pbr') onParamChange('show_heatmap', false);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  activeShading === s.id
                    ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Spatial Force Labels */}
      {params.show_pressure_vectors && (
        <div className="absolute top-14 left-4 pointer-events-none z-10 flex flex-col gap-1 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-emerald-500/40 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
            <span>LIFT: {(telemetry.lift_N / 1000).toFixed(1)} kN</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-red-500/40 text-red-300">
            <span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_#ef4444]" />
            <span>DRAG: {(telemetry.drag_N / 1000).toFixed(1)} kN</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-cyan-500/40 text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
            <span>L/D: {telemetry.ldRatio.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* CFD Pressure Heatmap Legend Overlay */}
      {(activeShading === 'cfdHeatmap' || params.show_heatmap) && (
        <div className="absolute top-14 right-4 pointer-events-none z-10 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-xl border border-cyan-500/30 flex flex-col gap-1 text-[10px] font-mono shadow-xl">
          <span className="text-cyan-200 font-bold tracking-wider">Cp PRESSURE COEFFICIENT</span>
          <div className="w-32 h-2.5 rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 via-emerald-400 via-amber-400 to-red-600 border border-white/20" />
          <div className="flex justify-between text-slate-300">
            <span>-2.5 (Suction)</span>
            <span>0</span>
            <span>+1.0 (Ram)</span>
          </div>
        </div>
      )}

    </div>
  );
};
