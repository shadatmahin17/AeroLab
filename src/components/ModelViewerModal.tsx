import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  X, 
  RotateCw, 
  Box, 
  Layers, 
  Camera, 
  Sun, 
  Sparkles, 
  ShieldCheck, 
  Info, 
  Check, 
  SlidersHorizontal,
  Compass,
  Download
} from 'lucide-react';

interface ModelViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToWindTunnel?: (options: { landingGear: boolean }) => void;
}

export const ModelViewerModal: React.FC<ModelViewerModalProps> = ({
  isOpen,
  onClose,
  onApplyToWindTunnel,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Loading state
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Inspector controls
  const [isAutoSpin, setIsAutoSpin] = useState<boolean>(true);
  const [wireframeMode, setWireframeMode] = useState<boolean>(false);
  const [lightingPreset, setLightingPreset] = useState<'tunnel' | 'studio' | 'sunset' | 'cyber'>('tunnel');
  const [landingGearDeployed, setLandingGearDeployed] = useState<boolean>(false);

  // Mesh component visibility states
  const [componentVisibility, setComponentVisibility] = useState<Record<string, boolean>>({
    airframe: true,
    canopy: true,
    cockpit: true,
    hud: true,
    instrGlass: true,
  });

  const lightsGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const mount = mountRef.current;
    if (!mount) return;

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadError(null);

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060a12);

    // 2. Camera setup
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
    camera.position.set(16, 8, 16);
    cameraRef.current = camera;

    // 3. Renderer setup
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
    controls.maxDistance = 45;
    controls.minDistance = 4;
    controlsRef.current = controls;

    // 5. Lighting group
    const lightsGroup = new THREE.Group();
    scene.add(lightsGroup);
    lightsGroupRef.current = lightsGroup;

    const updateLights = (preset: 'tunnel' | 'studio' | 'sunset' | 'cyber') => {
      lightsGroup.clear();
      if (preset === 'tunnel') {
        lightsGroup.add(new THREE.AmbientLight(0x38bdf8, 0.6));
        const key = new THREE.DirectionalLight(0xe0f2fe, 2.2);
        key.position.set(-15, 20, 15);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0x0284c7, 1.8);
        rim.position.set(15, -10, -15);
        lightsGroup.add(rim);
      } else if (preset === 'studio') {
        lightsGroup.add(new THREE.AmbientLight(0xffffff, 1.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.5);
        key.position.set(10, 20, 10);
        lightsGroup.add(key);
        const fill = new THREE.DirectionalLight(0xf1f5f9, 1.5);
        fill.position.set(-10, 10, -10);
        lightsGroup.add(fill);
      } else if (preset === 'sunset') {
        lightsGroup.add(new THREE.AmbientLight(0xf59e0b, 0.8));
        const key = new THREE.DirectionalLight(0xf97316, 3.0);
        key.position.set(-20, 10, 5);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0x7c3aed, 1.6);
        rim.position.set(20, -5, -10);
        lightsGroup.add(rim);
      } else {
        // Cyberpunk
        lightsGroup.add(new THREE.AmbientLight(0x06b6d4, 0.7));
        const key = new THREE.DirectionalLight(0x00f0ff, 2.5);
        key.position.set(-15, 15, 10);
        lightsGroup.add(key);
        const rim = new THREE.DirectionalLight(0xf43f5e, 2.5);
        rim.position.set(15, -10, -15);
        lightsGroup.add(rim);
      }
    };
    updateLights(lightingPreset);

    // 6. Ground circular grid & pedestal
    const gridHelper = new THREE.GridHelper(24, 24, 0x00f0ff, 0x1e3a5f);
    gridHelper.position.y = -3.5;
    scene.add(gridHelper);

    // 7. Load GLB Model
    const loader = new GLTFLoader();
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelRootRef.current = modelGroup;

    loader.load(
      '/models/f-22_raptor_-_fighter_jet_-_free.glb',
      (gltf) => {
        const root = gltf.scene;

        // Centering & scaling math derived from model bounds (length 189.95, center ~ 40.45, 11.05, 0)
        const scale = 12.0 / 189.95; // normalize length to 12 scene units
        root.scale.set(scale, scale, scale);
        root.position.set(-40.45 * scale, -11.05 * scale, 0);

        // Rotate so nose faces forward
        modelGroup.rotation.y = 0;

        // Traverse & configure materials
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Make glass canopy realistically translucent
            if (mesh.name === 'Object_6') {
              mesh.material = new THREE.MeshPhysicalMaterial({
                color: 0x94a3b8,
                metalness: 0.1,
                roughness: 0.05,
                transmission: 0.88,
                transparent: true,
                opacity: 0.65,
                ior: 1.5,
              });
            }
          }
        });

        // Configure initial gear visibility
        updateGearVisibility(root, landingGearDeployed);

        modelGroup.add(root);
        setIsLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingProgress(pct);
        }
      },
      (error) => {
        console.error('Error loading F-22 GLB model:', error);
        setLoadError('Failed to load 3D GLB model. Please check file path.');
        setIsLoading(false);
      }
    );

    // 8. Animation loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (isAutoSpin && modelRootRef.current) {
        modelRootRef.current.rotation.y += 0.006;
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

  // Update lighting on preset change
  useEffect(() => {
    if (!lightsGroupRef.current) return;
    const lightsGroup = lightsGroupRef.current;
    lightsGroup.clear();
    if (lightingPreset === 'tunnel') {
      lightsGroup.add(new THREE.AmbientLight(0x38bdf8, 0.6));
      const key = new THREE.DirectionalLight(0xe0f2fe, 2.2);
      key.position.set(-15, 20, 15);
      lightsGroup.add(key);
      const rim = new THREE.DirectionalLight(0x0284c7, 1.8);
      rim.position.set(15, -10, -15);
      lightsGroup.add(rim);
    } else if (lightingPreset === 'studio') {
      lightsGroup.add(new THREE.AmbientLight(0xffffff, 1.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(10, 20, 10);
      lightsGroup.add(key);
      const fill = new THREE.DirectionalLight(0xf1f5f9, 1.5);
      fill.position.set(-10, 10, -10);
      lightsGroup.add(fill);
    } else if (lightingPreset === 'sunset') {
      lightsGroup.add(new THREE.AmbientLight(0xf59e0b, 0.8));
      const key = new THREE.DirectionalLight(0xf97316, 3.0);
      key.position.set(-20, 10, 5);
      lightsGroup.add(key);
      const rim = new THREE.DirectionalLight(0x7c3aed, 1.6);
      rim.position.set(20, -5, -10);
      lightsGroup.add(rim);
    } else {
      lightsGroup.add(new THREE.AmbientLight(0x06b6d4, 0.7));
      const key = new THREE.DirectionalLight(0x00f0ff, 2.5);
      key.position.set(-15, 15, 10);
      lightsGroup.add(key);
      const rim = new THREE.DirectionalLight(0xf43f5e, 2.5);
      rim.position.set(15, -10, -15);
      lightsGroup.add(rim);
    }
  }, [lightingPreset]);

  // Update wireframe mode
  useEffect(() => {
    if (!modelRootRef.current) return;
    modelRootRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = wireframeMode;
          });
        } else if (mat && 'wireframe' in mat) {
          (mat as THREE.MeshStandardMaterial).wireframe = wireframeMode;
        }
      }
    });
  }, [wireframeMode]);

  // Helper: toggle gear nodes
  const updateGearVisibility = (root: THREE.Object3D, deployed: boolean) => {
    root.traverse((obj) => {
      // Object_14 is landingOff (retracted)
      if (obj.name === 'Object_14' || obj.name === 'F-22-landingOff_5') {
        obj.visible = !deployed;
      }
      // Object_16 and Object_18 are landingOn (deployed gear & lights)
      if (
        obj.name === 'Object_16' ||
        obj.name === 'F-22-landingOn_6' ||
        obj.name === 'Object_18' ||
        obj.name === 'F-22-landingOnLight_7'
      ) {
        obj.visible = deployed;
      }
    });
  };

  // Update landing gear
  useEffect(() => {
    if (!modelRootRef.current) return;
    updateGearVisibility(modelRootRef.current, landingGearDeployed);
  }, [landingGearDeployed]);

  // Update component visibility
  useEffect(() => {
    if (!modelRootRef.current) return;
    modelRootRef.current.traverse((obj) => {
      if (obj.name === 'Object_4' || obj.name === 'F-22-airframe_0') {
        obj.visible = componentVisibility.airframe;
      } else if (obj.name === 'Object_6' || obj.name === 'F-22-canopy_1') {
        obj.visible = componentVisibility.canopy;
      } else if (obj.name === 'Object_8' || obj.name === 'F-22-cockpit_2') {
        obj.visible = componentVisibility.cockpit;
      } else if (obj.name === 'Object_10' || obj.name === 'F-22-hud_3') {
        obj.visible = componentVisibility.hud;
      } else if (obj.name === 'Object_12' || obj.name === 'F-22-instrGlass_4') {
        obj.visible = componentVisibility.instrGlass;
      }
    });
  }, [componentVisibility]);

  // Screenshot capture
  const handleTakeSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `f22-raptor-3d-cad-${Date.now()}.png`;
    a.click();
  };

  // Reset camera view
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(16, 8, 16);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-6xl h-[90vh] bg-slate-900/90 border border-cyan-500/40 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Box className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-sans tracking-wide text-white">
                  F-22 Raptor — 3D CAD Asset Inspector
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  GLTF 2.0 Binary
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  26.5 MB PBR
                </span>
              </div>
              <p className="text-xs text-slate-400">
                High-Fidelity Airframe by bohmerang · Sketchfab CC-BY-NC-SA 4.0
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

        {/* Main Body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Left Viewport (3D Canvas) */}
          <div className="relative flex-1 h-full min-h-[360px] bg-gradient-to-b from-[#050810] to-[#0a1122]">
            <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Loading Indicator */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md gap-4 z-10">
                <div className="w-14 h-14 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-sm font-semibold text-cyan-100 font-mono">
                    Loading High-Res 3D Jet Asset... {loadingProgress}%
                  </span>
                  <div className="w-48 h-2 rounded-full bg-slate-800 overflow-hidden border border-cyan-500/30">
                    <div 
                      className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-all duration-200"
                      style={{ width: `${Math.max(5, loadingProgress)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">Parsing 26.57 MB textures & meshes</span>
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
                  onClick={() => setWireframeMode(!wireframeMode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    wireframeMode
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Wireframe</span>
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

          {/* Right Inspector & Metadata Panel */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-cyan-500/20 bg-slate-950/70 p-5 flex flex-col gap-5 overflow-y-auto max-h-[45vh] lg:max-h-full">
            
            {/* 1. Sub-mesh Hierarchy Controls */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 uppercase tracking-wider font-sans">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  CAD Mesh Hierarchy
                </span>
                <span className="text-[10px] text-cyan-400 font-mono">52k Verts</span>
              </div>

              <div className="flex flex-col gap-1.5">
                {[
                  { key: 'airframe', name: 'Airframe & Wings', verts: '33,837' },
                  { key: 'canopy', name: 'Glass Canopy', verts: '84' },
                  { key: 'cockpit', name: 'Cockpit Interior', verts: '1,908' },
                  { key: 'hud', name: 'HUD Avionics Display', verts: '20' },
                  { key: 'instrGlass', name: 'Instrument Glass', verts: '84' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() =>
                      setComponentVisibility((prev) => ({
                        ...prev,
                        [item.key]: !prev[item.key],
                      }))
                    }
                    className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-all border ${
                      componentVisibility[item.key]
                        ? 'bg-slate-800/80 border-cyan-500/30 text-slate-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500 line-through'
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="text-[10px] font-mono text-cyan-400/80">{item.verts} v</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Landing Gear Config */}
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                Landing Gear Configuration
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLandingGearDeployed(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${
                    !landingGearDeployed
                      ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  🛫 Retracted (Flight)
                </button>
                <button
                  onClick={() => setLandingGearDeployed(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${
                    landingGearDeployed
                      ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  🛬 Deployed (Ground)
                </button>
              </div>
            </div>

            {/* 3. Studio Lighting Atmosphere */}
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                Chamber Lighting
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
                <span>File Size:</span>
                <span className="font-mono text-cyan-300">26.57 MB</span>
              </div>
              <div className="flex justify-between">
                <span>Total Meshes:</span>
                <span className="font-mono text-cyan-300">8 Primitives</span>
              </div>
              <div className="flex justify-between">
                <span>Fuselage Length:</span>
                <span className="font-mono text-cyan-300">18.90 m</span>
              </div>
              <div className="flex justify-between">
                <span>Wingspan:</span>
                <span className="font-mono text-cyan-300">13.56 m</span>
              </div>

              {onApplyToWindTunnel && (
                <button
                  onClick={() => {
                    onApplyToWindTunnel({ landingGear: landingGearDeployed });
                    onClose();
                  }}
                  className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-400 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply &amp; Return to Wind Tunnel</span>
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
