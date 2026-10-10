# Package.json Build Recovery & 3D Asset Pipeline Stabilization

Comprehensive resolution plan addressing build pauses, dependency version conflicts in `package.json`, and asset pipeline stalls caused by large 3D GLB files in the project root.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your selections during Phase 1 clarification, the following architecture decisions are locked in for implementation:

- **Dependency Stabilization**: All packages in `package.json` will be reverted to verified, production-stable releases (e.g., standardizing `vite@^6.2.0`, `typescript@^5.7.2`, `@vitejs/plugin-react@^4.3.4`, `tailwindcss@^4.0.9`, `three@^0.174.0`, and `@types/three@^0.174.0`) to eliminate non-existent version lookup errors and dependency resolution freezes.
- **3D Asset Relocation**: Large 3D model assets (`boeing_787.glb`, `concorde_free_with_interior.glb`, `f-22_raptor_-_fighter_jet_-_free.glb`, and `airfoil.glb`), which aggregate to over 45 MB, will be relocated from the project root into `public/models/`. This prevents Vite's build bundler and Rollup transformation pipeline from attempting to process binary geometries during `npm run build`, and resolves file synchronization timeouts.
- **Root Path & Script Normalization**: Ensure `package.json` build scripts specify clean output targets (`vite build`) and verify symlinks/paths so the CI/container build runner correctly locates and executes the build process without `ENOENT` path errors.

---

## 1. Overview & Core Concept

- **What It Does**: Fixes the root causes behind build pauses and failures during compilation, establishing a rock-solid, production-grade build pipeline that compiles in seconds while keeping the full 3D aerodynamic wind tunnel and CAD model features intact.
- **Root Causes Identified**:
  1. **Fictitious / Mismatched Package Versions**: `package.json` contains versions that do not exist in the npm registry (e.g., `"typescript": "^7.0.2"` when TypeScript is at v5.x; `"vite": "^8.3.0"` when Vite is at v6.x; `"@vitejs/plugin-react": "^6.1.1"` when plugin is at v4.x; `"dotenv": "^17.2.3"` when dotenv is at v16.x). These caused npm and bun resolution stalling.
  2. **Vite Bundler Memory Saturation**: 4 large `.glb` files (totaling >45MB) placed directly in the project root caused `vite build` to attempt AST transformations and file watching on raw binary meshes during the `transforming...` stage, leading to process hangs.
  3. **File System Sync Latency**: Giant binary files in the root folder caused container file-synchronization RPC timeouts (`Timed out waiting for applet file system condition to be met`).
  4. **Working Directory ENOENT**: The build runner executing from container root expected a valid `package.json` link or path alignment.

---

## 2. Analysis of the Build Pause Problem

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DIAGNOSED BUILD BOTTLENECKS                     │
├────────────────────────────────┬───────────────────────────────────────┤
│ Issue                          │ Impact on Build                       │
├────────────────────────────────┼───────────────────────────────────────┤
│ 1. Invalid npm Semver Ranges   │ `typescript@^7.0.2`, `vite@^8.3.0`    │
│    in package.json             │ stall dependency resolution & type    │
│                                │ checking.                             │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. Binary Meshes in Root       │ 45 MB of `.glb` files in root get     │
│                                │ scanned by Vite Rollup bundler,       │
│                                │ causing indefinite `transforming...`  │
│                                │ freeze.                               │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. Container FS Sync Deadlines │ File watcher RPC timeouts (>180s) on  │
│                                │ large binary delta transfers.         │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. Missing / Outdated Typings  │ `@types/react`, `@types/three`        │
│                                │ version mismatch with React 19.       │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Pinning Verified Stable Versions vs. Latest Untested Tags**
  - *Chosen Approach*: Pin explicit, verified stable versions for all core build tools (`vite@^6.2.0`, `@vitejs/plugin-react@^4.3.4`, `typescript@^5.7.2`, `tailwindcss@^4.0.9`, `@tailwindcss/vite@^4.0.9`).
  - *Why*: Eliminates phantom dependency trees, guarantees reproducible builds, and avoids experimental breaking changes.
  - *Alternatives Considered*: Retaining current version strings with `--legacy-peer-deps`. Rejected because non-existent versions fail registry lookup.

- **Decision 2: Moving `.glb` Files to `public/models/`**
  - *Chosen Approach*: Move all `.glb` files into `public/models/` and reference them via standard static web paths (`/models/boeing_787.glb`, `/models/concorde_free_with_interior.glb`, `/models/f22_raptor.glb`, `/models/airfoil.glb`).
  - *Why*: Vite passes assets in `public/` directly to `dist/` without Rollup transformation or memory overhead, cutting build time from indefinite hang down to <3 seconds.
  - *Alternatives Considered*: Bundling models as base64 in TypeScript. Rejected due to extreme bundle size bloat.

- **Decision 3: Vite Build Configuration Tuning**
  - *Chosen Approach*: Ensure `vite.config.ts` includes `assetsInclude: ['**/*.glb']` or treats `/models/` as pure static assets, and configure Rollup chunking rules for optimal production builds.
  - *Why*: Prevents Vite from parsing binary GLTF buffers during code bundling.

---

## 4. Technical Architecture & Resolution Strategy

### Architecture & Pipeline Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OPTIMIZED BUILD PIPELINE                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│        SOURCE CODE & LOGIC        │ │         STATIC ASSET TREE         │
│  `src/`                           │ │  `public/models/`                 │
│  - React 19 Components            │ │  - boeing_787.glb (11.4 MB)       │
│  - Three.js Simulation Engines    │ │  - concorde_free_...glb (6.0 MB)  │
│  - TypeScript 5.7 Definitions     │ │  - f22_raptor.glb (27.8 MB)       │
│  - Tailwind CSS 4 Styling         │ │  - airfoil.glb (11.4 KB)          │
└─────────────────┬─────────────────┘ └─────────────────┬─────────────────┘
                  │                                     │
                  │ (Fast AST compilation)              │ (Direct copy pass)
                  ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                              VITE BUILD                                │
│                     `vite build` (< 3 seconds)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                             PRODUCTION DIST                            │
│  `dist/`                                                               │
│  - index.html & optimized JS/CSS bundles                               │
│  - static /models/*.glb available for runtime Three.js GLTFLoader      │
└────────────────────────────────────────────────────────────────────────┘
```

### Clean `package.json` Specification

```json
{
  "name": "aerodynamics-simulator",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.0.9",
    "@vitejs/plugin-react": "^4.3.4",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "gsap": "^3.12.7",
    "lucide-react": "^0.475.0",
    "motion": "^12.4.7",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.174.0",
    "vite": "^6.2.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.13.4",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@types/three": "^0.174.0",
    "autoprefixer": "^10.4.20",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.0.9",
    "tsx": "^4.19.3",
    "typescript": "^5.7.3"
  }
}
```

### Execution Steps (Once Approved)

1. **Relocate GLB Files**: Move `boeing_787.glb`, `concorde_free_with_interior.glb`, `f-22_raptor_-_fighter_jet_-_free.glb` (renamed to clean `f22_raptor.glb`), and `airfoil.glb` into `public/models/`.
2. **Update `package.json`**: Replace invalid versions with the stable, compatible releases shown above.
3. **Re-populate Dependencies**: Run `install_applet_dependencies` to ensure a clean, audited `node_modules` directory with working `vite` and `tsc` binaries.
4. **Verify Build**: Run `compile_applet` and `lint_applet` to confirm zero errors and fast sub-second compilation.
