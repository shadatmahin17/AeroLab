import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AircraftModelType } from '../types/aerodynamics';
import { AIRCRAFT_MODELS } from '../utils/airfoilGenerators';
import { 
  loadGlbAircraftModel, 
  GLB_MODEL_REGISTRY, 
  applyCfdPressureHeatmap, 
  restoreOriginalGlbMaterials, 
  applyWireframeShading,
  createAeroForceVectorsGroup,
  updateAeroForceVectors
} from '../utils/aircraftGlbModels';
import { 
  X, 
  RotateCw, 
  Box, 
  Layers, 
  Camera, 
  Sun, 
  Wind, 
  Activity, 
  Check, 
  SlidersHorizontal,
  Compass,
  Download,
  Flame,
  Plane
} from 'lucide-react';

interface ModelViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeModelType?: AircraftModelType;
  onSelectModel?: (modelType: AircraftModelType) => void;
  onApplyToWindTunnel?: (options: { modelType: AircraftModelType; landingGear: boolean }) => void;
}

export const ModelViewerModal: React.FC<ModelViewerModalProps> = ({
  isOpen,
  onClose,
  activeModelType = 'f22',
  onSelectModel,
  onApplyToWindTunnel,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const forceVectorsRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lightsGroupRef = useRef<THREE.Group | null>(null);

  // Active inspected model
  const [selectedModel, setSelectedModel] = useState<AircraftModelType>(activeModelType);

  // Loading state
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Inspector controls
  const [isAutoSpin, setIsAutoSpin] = useState<boolean>(true);
  const [shadingMode, setShadingMode] = useState<'pbr' | 'cfdHeatmap' | 'wireframe' | 'xray'>('pbr');
  const [lightingPreset, setLightingPreset] = useState<'tunnel' | 'studio' | 'sunset' | 'cyber'>('tunnel');
  const [showForceVectors, setShowForceVectors] = useState<boolean>(true);
  const [showStreamlines, setShowStreamlines] = useState<boolean>(true);
  const [inspectorAoA, setInspectorAoA] = useState<number>(4.0);
  const [isStalled, setIsStalled] = useState<boolean>(false);
  const [landingGearDeployed, setLandingGearDeployed] = useState<boolean>(false);

  // Mesh stats
  const [meshCount, setMeshCount] = useState<number>(0);
  const [vertexCount, setVertexCount] = useState<number>(0);

  // Sync with prop when opened
  useEffect(() => {
    if (activeModelType) {
      setSelectedModel(activeModelType);
    }
  }, [activeModelType, isOpen]);

  // Main Scene Setup
  useEffect(() => {
    if (!isOpen) return;

    const mount = mountRef.current;
    if (!mount) return;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060a12);

    // 2. Camera
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
    camera.position.set(16, 8, 16);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
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
    controls.maxDistance = 60;
    controls.minDistance = 4;
    controlsRef.current = controls;

    // 5. Lighting
    const lightsGroup = new THREE.Group();
    scene.add(lightsGroup);
    lightsGroupRef.current = lightsGroup;

    const updateLights = (preset: 'tunnel' | 'studio' | 'sunset' | 'cyber') => {
      lightsGroup.clear();
      if (preset === 'tunnel') {
        lightsGroup.add(new THREE.AmbientLight(0x38bdf8, 0.65));
        const key = new THREE.DirectionalLight(0xe0f2fe, 2.4);
        key.position.set(-15, 20, 15);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0x0284c7, 1.8);
        rim.position.set(15, -10, -15);
        lightsGroup.add(rim);
      } else if (preset === 'studio') {
        lightsGroup.add(new THREE.AmbientLight(0xffffff, 1.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.8);
        key.position.set(10, 20, 10);
        lightsGroup.add(key);
        const fill = new THREE.DirectionalLight(0xf1f5f9, 1.5);
        fill.position.set(-10, 10, -10);
        lightsGroup.add(fill);
      } else if (preset === 'sunset') {
        lightsGroup.add(new THREE.AmbientLight(0xf59e0b, 0.8));
        const key = new THREE.DirectionalLight(0xf97316, 3.2);
        key.position.set(-20, 10, 5);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0x7c3aed, 1.8);
        rim.position.set(20, -5, -10);
        lightsGroup.add(rim);
      } else {
        lightsGroup.add(new THREE.AmbientLight(0x06b6d4, 0.7));
        const key = new THREE.DirectionalLight(0x00f0ff, 2.6);
        key.position.set(-15, 15, 10);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0xf43f5e, 2.6);
        rim.position.set(15, -10, -15);
        lightsGroup.add(rim);
      }
    };
    updateLights(lightingPreset);

    // 6. Ground grid & pedestal
    const gridHelper = new THREE.GridHelper(26, 26, 0x00f0ff, 0x1e3a5f);
    gridHelper.position.y = -3.8;
    scene.add(gridHelper);

    // 7. Force Vectors Group
    const forceGroup = createAeroForceVectorsGroup();
    scene.add(forceGroup);
    forceVectorsRef.current = forceGroup;

    // 8. Animation Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (isAutoSpin && modelRootRef.current) {
        modelRootRef.current.rotation.y += 0.005;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. Resize handler
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
  }, [isOpen]);

  // Load Selected GLB Model
  useEffect(() => {
    if (!isOpen || !sceneRef.current) return;
    const scene = sceneRef.current;

    // Clear old model
    if (modelRootRef.current) {
      scene.remove(modelRootRef.current);
      modelRootRef.current = null;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadError(null);

    loadGlbAircraftModel(selectedModel, (pct) => setLoadingProgress(pct))
      .then(({ root, metadata }) => {
        modelRootRef.current = root;
        scene.add(root);

        // Count meshes and vertices
        let mCount = 0;
        let vCount = 0;
        root.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            mCount++;
            const g = (c as THREE.Mesh).geometry;
            if (g && g.attributes.position) {
              vCount += g.attributes.position.count;
            }
          }
        });
        setMeshCount(mCount);
        setVertexCount(vCount);

        // Apply active shading
        if (shadingMode === 'cfdHeatmap') {
          applyCfdPressureHeatmap(root, inspectorAoA, isStalled);
        } else if (shadingMode === 'wireframe') {
          applyWireframeShading(root, true);
        }

        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error loading GLB in inspector:', err);
        setLoadError(`Failed to load 3D CAD asset for ${selectedModel}.`);
        setIsLoading(false);
      });
  }, [isOpen, selectedModel]);

  // Update AoA Pitch & Heatmap in Inspector
  useEffect(() => {
    if (!modelRootRef.current) return;
    const root = modelRootRef.current;

    // Pitch model with AoA slider
    const pitchRad = (inspectorAoA * Math.PI) / 180;
    root.rotation.z = -pitchRad;

    // Update heatmap if active
    if (shadingMode === 'cfdHeatmap') {
      applyCfdPressureHeatmap(root, inspectorAoA, isStalled);
    }

    // Update force vectors
    if (forceVectorsRef.current) {
      const liftSim_N = Math.sin(pitchRad + 0.08) * 1.8e6;
      const dragSim_N = (0.02 + Math.pow(Math.sin(pitchRad), 2) * 0.8) * 4e5;
      updateAeroForceVectors(forceVectorsRef.current, liftSim_N, dragSim_N, inspectorAoA, showForceVectors);
    }
  }, [inspectorAoA, isStalled, shadingMode, showForceVectors]);

  // Update Shading Mode
  useEffect(() => {
    if (!modelRootRef.current) return;
    const root = modelRootRef.current;

    if (shadingMode === 'cfdHeatmap') {
      applyCfdPressureHeatmap(root, inspectorAoA, isStalled);
    } else if (shadingMode === 'wireframe') {
      restoreOriginalGlbMaterials(root);
      applyWireframeShading(root, true);
    } else if (shadingMode === 'xray') {
      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1,
            metalness: 0.8,
          });
        }
      });
    } else {
      restoreOriginalGlbMaterials(root);
      applyWireframeShading(root, false);
    }
  }, [shadingMode, inspectorAoA, isStalled]);

  // Lighting Update
  useEffect(() => {
    if (!lightsGroupRef.current) return;
    const lightsGroup = lightsGroupRef.current;
    lightsGroup.clear();

    if (lightingPreset === 'tunnel') {
      lightsGroup.add(new THREE.AmbientLight(0x38bdf8, 0.65));
      const key = new THREE.DirectionalLight(0xe0f2fe, 2.4);
      key.position.set(-15, 20, 15);
      lightsGroup.add(key);
      const rim = new THREE.DirectionalLight(0x0284c7, 1.8);
      rim.position.set(15, -10, -15);
      lightsGroup.add(rim);
    } else if (lightingPreset === 'studio') {
      lightsGroup.add(new THREE.AmbientLight(0xffffff, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.8);
      key.position.set(10, 20, 10);
      lightsGroup.add(key);
      const fill = new THREE.DirectionalLight(0xf1f5f9, 1.5);
      fill.position.set(-10, 10, -10);
      lightsGroup.add(fill);
    } else if (lightingPreset === 'sunset') {
      lightsGroup.add(new THREE.AmbientLight(0xf59e0b, 0.8));
      const key = new THREE.DirectionalLight(0xf97316, 3.2);
      key.position.set(-20, 10, 5);
      lightsGroup.add(key);
      const rim = new THREE.DirectionalLight(0x7c3aed, 1.8);
      rim.position.set(20, -5, -10);
      lightsGroup.add(rim);
    } else {
      lightsGroup.add(new THREE.AmbientLight(0x06b6d4, 0.7));
      const key = new THREE.DirectionalLight(0x00f0ff, 2.6);
      key.position.set(-15, 15, 10);
      lightsGroup.add(key);
      const rim = new THREE.DirectionalLight(0xf43f5e, 2.6);
      rim.position.set(15, -10, -15);
      lightsGroup.add(rim);
    }
  }, [lightingPreset]);

  // Take PNG Snapshot
  const handleTakeSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${selectedModel}-3d-cad-inspector-${Date.now()}.png`;
    a.click();
  };

  // Reset Camera View
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(16, 8, 16);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  if (!isOpen) return null;

  const currentMeta = GLB_MODEL_REGISTRY[selectedModel];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-6xl h-[92vh] bg-slate-900/90 border border-cyan-500/40 rounded-3xl shadow-[0_0_60px_rgba(6,182,212,0.25)] flex flex-col overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Box className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-sans tracking-wide text-white">
                  3D CAD Asset Inspector
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  GLTF 2.0 Binary
                </span>
                {currentMeta && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    {currentMeta.fileSizeLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {currentMeta ? currentMeta.sourceCredit : 'High-fidelity aerodynamic CAD meshes'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTakeSnapshot}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-white/10 hover:border-cyan-400/40 transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="Save PNG Snapshot"
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Snapshot</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-white/5"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Model Tabs Bar */}
        <div className="px-6 py-2.5 bg-slate-950/50 border-b border-cyan-500/15 flex items-center gap-2 overflow-x-auto custom-scrollbar">
          <span className="text-xs font-mono font-bold text-slate-400 mr-2 flex items-center gap-1">
            <Plane className="w-3.5 h-3.5 text-cyan-400" />
            SELECT MODEL:
          </span>
          {[
            { id: 'f22', label: 'F-22 Raptor', tag: 'Stealth Fighter' },
            { id: 'airliner', label: 'Boeing 787', tag: 'Airliner CAD' },
            { id: 'concorde', label: 'Concorde SST', tag: 'Supersonic' },
            { id: 'naca2412', label: 'Airfoil Section', tag: '3D Wing' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedModel(m.id as AircraftModelType);
                if (onSelectModel) onSelectModel(m.id as AircraftModelType);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                selectedModel === m.id
                  ? 'bg-cyan-950/80 text-cyan-200 border-cyan-400/70 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
              }`}
            >
              <span>{m.label}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/40 text-cyan-400/80">
                {m.tag}
              </span>
            </button>
          ))}
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Left Viewport (3D Canvas) */}
          <div className="relative flex-1 h-full min-h-[360px] bg-gradient-to-b from-[#050810] to-[#0a1122]">
            <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Loading Indicator */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md gap-4 z-10">
                <div className="w-14 h-14 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin shadow-[0_0_20px_rgba(6,182,212,0.4)]" />
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-sm font-semibold text-cyan-100 font-mono">
                    Loading {currentMeta ? currentMeta.name : '3D CAD Model'}... {loadingProgress}%
                  </span>
                  <div className="w-48 h-2 rounded-full bg-slate-800 overflow-hidden border border-cyan-500/30">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400 transition-all duration-200"
                      style={{ width: `${Math.max(5, loadingProgress)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentMeta ? currentMeta.fileSizeLabel : 'Parsing geometry & textures'}
                  </span>
                </div>
              </div>
            )}

            {loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 gap-3 z-10 text-center p-6">
                <span className="text-red-400 font-semibold">{loadError}</span>
              </div>
            )}

            {/* Floating 3D Toolbar Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 pointer-events-auto shadow-lg">
                <button
                  onClick={() => setIsAutoSpin(!isAutoSpin)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isAutoSpin
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isAutoSpin ? 'animate-spin' : ''}`} />
                  <span>Turntable</span>
                </button>
                <button
                  onClick={handleResetCamera}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  Reset View
                </button>
              </div>

              <div className="text-[11px] font-mono text-cyan-300 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 pointer-events-auto">
                Drag: Orbit · Scroll: Zoom · Right-drag: Pan
              </div>
            </div>
          </div>

          {/* Right Inspector & Aerodynamic Overlays Panel */}
          <div className="w-full lg:w-88 border-t lg:border-t-0 lg:border-l border-cyan-500/20 bg-slate-950/70 p-5 flex flex-col gap-4 overflow-y-auto max-h-[48vh] lg:max-h-full custom-scrollbar">
            
            {/* 1. Aerodynamic Analysis Overlays (Heatmap & Vectors) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 uppercase tracking-wider font-sans">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Aerodynamic Surface Analysis
                </span>
                <span className="text-[10px] text-cyan-400 font-mono">CFD Mesh</span>
              </div>

              {/* Shading mode selector */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'pbr', label: 'PBR Shading', desc: 'Photorealistic textures' },
                  { id: 'cfdHeatmap', label: 'CFD Pressure', desc: 'Cp surface heatmap' },
                  { id: 'wireframe', label: 'Wireframe', desc: 'Structural mesh polygons' },
                  { id: 'xray', label: 'X-Ray Translucent', desc: 'Internal diagnostic' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setShadingMode(s.id as any)}
                    className={`p-2 rounded-xl text-left flex flex-col transition-all border ${
                      shadingMode === s.id
                        ? 'bg-cyan-950/80 border-cyan-400/60 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                        : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-bold">{s.label}</span>
                    <span className="text-[10px] text-slate-400">{s.desc}</span>
                  </button>
                ))}
              </div>

              {/* Angle of Attack Pitch Slider */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Test Angle of Attack (AoA):</span>
                  <span className="font-mono text-cyan-300 font-bold">{inspectorAoA.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="28"
                  step="0.5"
                  value={inspectorAoA}
                  onChange={(e) => setInspectorAoA(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>-10°</span>
                  <button
                    onClick={() => setIsStalled(!isStalled)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all ${
                      isStalled
                        ? 'bg-red-500/30 text-red-200 border border-red-500/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isStalled ? '⚠️ STALL ACTIVE' : 'Stall Normal'}
                  </button>
                  <span>+28°</span>
                </div>
              </div>
            </div>

            {/* 2. Force Vectors Toggle */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-cyan-400" />
                3D Force Vectors Overlay
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowForceVectors(!showForceVectors)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 ${
                    showForceVectors
                      ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>{showForceVectors ? 'Vectors Visible' : 'Vectors Hidden'}</span>
                </button>

                <button
                  onClick={() => setLandingGearDeployed(!landingGearDeployed)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 ${
                    landingGearDeployed
                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{landingGearDeployed ? 'Gear: Down' : 'Gear: Up'}</span>
                </button>
              </div>
            </div>

            {/* 3. Studio Lighting Atmosphere */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                Lighting Environment
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'tunnel', label: 'Wind Tunnel' },
                  { id: 'studio', label: 'Studio White' },
                  { id: 'sunset', label: 'Sunset Glow' },
                  { id: 'cyber', label: 'Cyberpunk' },
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLightingPreset(l.id as any)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-medium text-center transition-all border ${
                      lightingPreset === l.id
                        ? 'bg-cyan-950/80 text-cyan-200 border-cyan-400/50 shadow-sm'
                        : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Asset Technical Specifications */}
            <div className="mt-auto pt-3 border-t border-cyan-500/15 flex flex-col gap-2 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>Model Format:</span>
                <span className="font-mono text-cyan-300">GLTF 2.0 Binary (.glb)</span>
              </div>
              <div className="flex justify-between">
                <span>Total Meshes:</span>
                <span className="font-mono text-cyan-300">{meshCount > 0 ? `${meshCount} Groups` : currentMeta?.meshCountLabel}</span>
              </div>
              <div className="flex justify-between">
                <span>Vertices:</span>
                <span className="font-mono text-cyan-300">{vertexCount > 0 ? vertexCount.toLocaleString() : '52,400+'}</span>
              </div>
              <div className="flex justify-between">
                <span>Wingspan:</span>
                <span className="font-mono text-cyan-300">{AIRCRAFT_MODELS[selectedModel]?.wingspan} m</span>
              </div>

              {onApplyToWindTunnel && (
                <button
                  onClick={() => {
                    onApplyToWindTunnel({ modelType: selectedModel, landingGear: landingGearDeployed });
                    onClose();
                  }}
                  className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-400 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply to Wind Tunnel &amp; Return</span>
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
