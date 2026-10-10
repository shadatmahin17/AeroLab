import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AircraftModelType } from '../types/aerodynamics';

export interface GlbModelMetadata {
  id: AircraftModelType;
  name: string;
  glbPath: string;
  targetLength: number;
  rotationOffset: [number, number, number];
  positionOffset: [number, number, number];
  scaleMultiplier: number;
  fileSizeLabel: string;
  meshCountLabel: string;
  sourceCredit: string;
}

export const GLB_MODEL_REGISTRY: Record<string, GlbModelMetadata> = {
  airliner: {
    id: 'airliner',
    name: 'Boeing 787 Dreamliner',
    glbPath: '/models/boeing_787.glb',
    targetLength: 14.5,
    // Model orientation: Align nose into wind (-X)
    rotationOffset: [0, Math.PI / 2, 0],
    positionOffset: [0, 0, 0],
    scaleMultiplier: 1.0,
    fileSizeLabel: '11.0 MB CAD',
    meshCountLabel: '1,872 Meshes',
    sourceCredit: 'High-detail Boeing 787 commercial airliner CAD model',
  },
  concorde: {
    id: 'concorde',
    name: 'Concorde SST (Supersonic)',
    glbPath: '/models/concorde_free_with_interior.glb',
    targetLength: 15.0,
    // Concorde length along X/Z: align nose facing -X
    rotationOffset: [0, -Math.PI / 2, 0],
    positionOffset: [0, 0, 0],
    scaleMultiplier: 1.0,
    fileSizeLabel: '5.8 MB PBR',
    meshCountLabel: '37 Meshes & Interior',
    sourceCredit: 'Concorde SST Mach 2.0 CAD model with passenger cabin',
  },
  naca2412: {
    id: 'naca2412',
    name: 'Airfoil Section 3D',
    glbPath: '/models/airfoil.glb',
    targetLength: 9.5,
    // Airfoil has span along X, chord along Z (-89 to 11): rotate so leading edge faces -X
    rotationOffset: [0, Math.PI / 2, 0],
    positionOffset: [0, 0, 0],
    scaleMultiplier: 1.0,
    fileSizeLabel: '11.4 KB Mesh',
    meshCountLabel: '1 Lifting Surface',
    sourceCredit: 'Precision aerodynamic 3D airfoil boundary wing section',
  },
  f22: {
    id: 'f22',
    name: 'F-22 Raptor Stealth Fighter',
    glbPath: '/models/f22_raptor.glb',
    targetLength: 13.0,
    rotationOffset: [0, 0, 0],
    positionOffset: [0, 0, 0],
    scaleMultiplier: 1.0,
    fileSizeLabel: '26.5 MB PBR',
    meshCountLabel: '8 Airframe Groups',
    sourceCredit: '5th-Gen Stealth Fighter CAD Mesh by bohmerang',
  },
};

// In-memory cache for parsed GLTF scenes
const gltfCache = new Map<string, THREE.Group>();

/**
 * Loads a GLB model with automatic centering, bounding-box normalization,
 * and airflow axis alignment (nose towards -X).
 */
export function loadGlbAircraftModel(
  modelType: AircraftModelType,
  onProgress?: (progressPercent: number) => void
): Promise<{ root: THREE.Group; metadata: GlbModelMetadata }> {
  return new Promise((resolve, reject) => {
    const meta = GLB_MODEL_REGISTRY[modelType];
    if (!meta) {
      reject(new Error(`No GLB model configured for type: ${modelType}`));
      return;
    }

    const loader = new GLTFLoader();

    loader.load(
      meta.glbPath,
      (gltf) => {
        const rawScene = gltf.scene;

        // Clone or prepare root wrapper
        const wrapper = new THREE.Group();
        wrapper.name = `GLB_${modelType}_Wrapper`;

        // Compute natural bounding box
        const box = new THREE.Box3().setFromObject(rawScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Principal length across axes
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const normalizedScale = (meta.targetLength / maxDim) * meta.scaleMultiplier;

        // Center the raw scene at origin
        rawScene.position.set(-center.x, -center.y, -center.z);

        const innerGroup = new THREE.Group();
        innerGroup.name = `GLB_${modelType}_Inner`;
        innerGroup.add(rawScene);
        innerGroup.scale.set(normalizedScale, normalizedScale, normalizedScale);

        // Apply metadata rotation to align with wind tunnel (-X)
        innerGroup.rotation.set(
          meta.rotationOffset[0],
          meta.rotationOffset[1],
          meta.rotationOffset[2]
        );

        innerGroup.position.set(
          meta.positionOffset[0],
          meta.positionOffset[1],
          meta.positionOffset[2]
        );

        wrapper.add(innerGroup);

        // Tag every mesh with original materials and vertex data
        wrapper.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Preserve original material
            mesh.userData.originalMaterial = mesh.material;

            // Ensure normals are computed
            if (mesh.geometry && !mesh.geometry.attributes.normal) {
              mesh.geometry.computeVertexNormals();
            }
          }
        });

        // Store in cache
        gltfCache.set(modelType, wrapper);
        resolve({ root: wrapper, metadata: meta });
      },
      (xhr) => {
        if (xhr.total > 0 && onProgress) {
          onProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (error) => {
        console.error(`Failed to load GLB model for ${modelType} from ${meta.glbPath}:`, error);
        reject(error);
      }
    );
  });
}

/**
 * Applies CFD Pressure Heatmap colors across the 3D GLB model based on
 * surface face normals relative to wind vector and angle of attack.
 *
 * Royal Blue (-2.5 Cp suction peak) -> Cyan -> Emerald (attached) -> Amber -> Crimson (+1.0 Stagnation)
 */
export function applyCfdPressureHeatmap(
  root: THREE.Group,
  aoaDeg: number,
  isStalled: boolean
): void {
  const aoaRad = (aoaDeg * Math.PI) / 180;
  // Wind flows from -X to +X, so freestream relative to aircraft is:
  // V_freestream = (cos(aoa), -sin(aoa), 0)
  const windDir = new THREE.Vector3(Math.cos(aoaRad), -Math.sin(aoaRad), 0).normalize();

  const normalMatrix = new THREE.Matrix3();
  const worldNormal = new THREE.Vector3();

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry;
    if (!geo || !geo.attributes.position) return;

    normalMatrix.getNormalMatrix(mesh.matrixWorld);

    // Create or reuse color attribute
    const posCount = geo.attributes.position.count;
    let colorAttr = geo.attributes.color as THREE.BufferAttribute;
    if (!colorAttr || colorAttr.count !== posCount) {
      colorAttr = new THREE.BufferAttribute(new Float32Array(posCount * 3), 3);
      geo.setAttribute('color', colorAttr);
    }

    const normals = geo.attributes.normal;

    for (let i = 0; i < posCount; i++) {
      if (normals) {
        worldNormal.set(normals.getX(i), normals.getY(i), normals.getZ(i));
        worldNormal.applyMatrix3(normalMatrix).normalize();
      } else {
        worldNormal.set(0, 1, 0);
      }

      // Normal dot wind: positive when facing into wind (ram compression), negative on suction side
      const dot = -worldNormal.dot(windDir);

      let r = 0, g = 0.5, b = 1.0;

      if (isStalled) {
        // Separation turbulent wake: mottled reddish-purple
        r = 0.95;
        g = 0.15 + (Math.sin(i * 0.3) * 0.1);
        b = 0.25;
      } else if (dot > 0.05) {
        // Leading edge / stagnation region: Cp > 0 (compression)
        const t = Math.min(1.0, dot * 1.3);
        // Emerald (0.05) -> Amber (0.5) -> Crimson (1.0)
        if (t < 0.5) {
          r = 0.1 + (t / 0.5) * 0.8;
          g = 0.7 + (t / 0.5) * 0.2;
          b = 0.1;
        } else {
          r = 0.9 + (t - 0.5) * 0.2;
          g = 0.9 - (t - 0.5) * 0.8;
          b = 0.05;
        }
      } else {
        // Suction side (upper wing / canopy): Cp < 0
        const suction = Math.min(1.0, Math.abs(dot) * 1.5);
        // Royal Blue (high suction) -> Electric Cyan -> Emerald
        r = 0.02;
        g = 0.5 + (1.0 - suction) * 0.4;
        b = 0.95;
      }

      colorAttr.setXYZ(i, r, g, b);
    }

    colorAttr.needsUpdate = true;

    // Apply vertex-colored material for heatmap
    if (!mesh.userData.heatmapMaterial) {
      mesh.userData.heatmapMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.DoubleSide,
      });
    }
    mesh.material = mesh.userData.heatmapMaterial;
  });
}

/**
 * Restores original PBR materials on the GLB mesh
 */
export function restoreOriginalGlbMaterials(root: THREE.Group): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.userData.originalMaterial) {
        mesh.material = mesh.userData.originalMaterial;
      }
    }
  });
}

/**
 * Applies wireframe shading to the GLB mesh
 */
export function applyWireframeShading(root: THREE.Group, enabled: boolean): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = enabled;
        });
      } else if (mat && 'wireframe' in mat) {
        (mat as THREE.MeshStandardMaterial).wireframe = enabled;
      }
    }
  });
}

/**
 * Creates 3D Force Vectors (Lift, Drag, Resultant, Center of Pressure)
 */
export function createAeroForceVectorsGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'AeroForceVectors';

  // 1. Lift Vector (Emerald Green arrow, points +Y)
  const liftArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 0),
    3.5,
    0x10b981,
    0.6,
    0.35
  );
  liftArrow.name = 'liftArrow';
  group.add(liftArrow);

  // 2. Drag Vector (Crimson Red arrow, points +X downstream)
  const dragArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    2.0,
    0xef4444,
    0.5,
    0.3
  );
  dragArrow.name = 'dragArrow';
  group.add(dragArrow);

  // 3. Resultant Aerodynamic Force Vector (Azure Cyan arrow)
  const resultantArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0.3, 0.95, 0).normalize(),
    new THREE.Vector3(0, 0, 0),
    4.0,
    0x00f0ff,
    0.6,
    0.35
  );
  resultantArrow.name = 'resultantArrow';
  group.add(resultantArrow);

  // 4. Center of Pressure (CP) Target Ring
  const cpRingGeo = new THREE.RingGeometry(0.28, 0.38, 32);
  cpRingGeo.rotateX(Math.PI / 2);
  const cpRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const cpRing = new THREE.Mesh(cpRingGeo, cpRingMat);
  cpRing.name = 'cpRing';
  group.add(cpRing);

  return group;
}

/**
 * Updates 3D Force Vectors based on live aerodynamic telemetry
 */
export function updateAeroForceVectors(
  group: THREE.Group,
  lift_N: number,
  drag_N: number,
  aoaDeg: number,
  visible = true
): void {
  group.visible = visible;
  if (!visible) return;

  const liftArrow = group.getObjectByName('liftArrow') as THREE.ArrowHelper | undefined;
  const dragArrow = group.getObjectByName('dragArrow') as THREE.ArrowHelper | undefined;
  const resultantArrow = group.getObjectByName('resultantArrow') as THREE.ArrowHelper | undefined;
  const cpRing = group.getObjectByName('cpRing') as THREE.Mesh | undefined;

  // Scale forces logarithmically or normalized to wind tunnel viewport [0.5, 6.0 units]
  const maxRefForce = 2.5e6; // ~2.5 MN
  const liftMagnitude = Math.max(0.4, Math.min(6.5, (Math.abs(lift_N) / maxRefForce) * 5.0 + 1.2));
  const dragMagnitude = Math.max(0.3, Math.min(4.8, (Math.abs(drag_N) / (maxRefForce * 0.35)) * 4.0 + 0.8));

  const liftSign = lift_N >= 0 ? 1 : -1;

  if (liftArrow) {
    liftArrow.setDirection(new THREE.Vector3(0, liftSign, 0));
    liftArrow.setLength(liftMagnitude, 0.6, 0.35);
  }

  if (dragArrow) {
    dragArrow.setDirection(new THREE.Vector3(1, 0, 0));
    dragArrow.setLength(dragMagnitude, 0.5, 0.3);
  }

  if (resultantArrow) {
    const resultantDir = new THREE.Vector3(dragMagnitude, liftMagnitude * liftSign, 0).normalize();
    const resultantLen = Math.hypot(liftMagnitude, dragMagnitude);
    resultantArrow.setDirection(resultantDir);
    resultantArrow.setLength(resultantLen, 0.6, 0.35);
  }

  if (cpRing) {
    // Dynamic Center of Pressure shifts forward with increasing AoA
    const cpShiftX = -0.5 - (aoaDeg * 0.04);
    cpRing.position.set(cpShiftX, 0, 0);
  }
}
