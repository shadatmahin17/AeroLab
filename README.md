# AeroLab — Interactive 3D Wind Tunnel & Aerodynamics Simulator

**AeroLab** is an interactive fluid dynamics and aerospace physics simulation platform. It allows engineers, aviation students, and flight enthusiasts to test real 3D aircraft models and airfoils inside a virtual wind tunnel, analyzing aerodynamic lift, drag, pressure distributions, flow separation, and supersonic shockwaves in real time.

---

## Key Features

### 1. Interactive 3D Aircraft Models
- **F-22 Raptor (Air Dominance Fighter)**: Blended chined fuselage, diamond delta wings with leading-edge extensions (LEX), twin canted vertical fins, stabilators, and supersonic afterburners.
- **Boeing 787 Dreamliner (Commercial Transport)**: Streamlined widebody fuselage, supercritical high-lift cambered wings with raked wingtips, underslung twin turbofans, and **deployable trailing-edge Fowler flaps** (0° to 40°).
- **Concorde (Supersonic Cruiser)**: Slender ogival delta wing deck, droop nose, Olympus 593 engine boxes, and Mach 2+ shockwave propagation.
- **NACA 2412 (Cambered Wing)**: Standard general aviation wing section (Cessna 172) with 2% camber, generating positive lift at 0° Angle of Attack.
- **NACA 0012 (Symmetric Wing)**: Aerobatic and rotorcraft airfoil with zero camber.
- **Circular Cylinder (Bluff Body)**: Classical benchmark for symmetric boundary layer detachment and von Kármán vortex shedding.

### 2. Dual Wind Tunnel Simulation Engines
- **3D Spatial Wind Tunnel Engine (Blender CAD Quality)**: Hardware-agnostic 3D projection engine with full 360° orbit, cinematic flyaround mode, zoom, dynamic pitch/AoA control with taileron trim, 3D multi-ribbon smoke streamlines with downwash deflection, counter-rotating **3D Wingtip Helical Vortices** (induced drag wake visualization), 850+ PIV velocity streak particle tracers, supersonic Mach cones ($\mu = \arcsin(1/M)$), and transonic Prandtl-Glauert condensation clouds.
- **2D Navier-Stokes Grid Solver**: Grid-based fluid solver (Jos Stam algorithm) computing velocity advection, viscous diffusion, mass conservation projection ($\nabla \cdot \vec{u} = 0$), and circulation downwash according to the Kutta-Joukowski theorem.
- **Vibrant Aerodynamic & Scientific CFD Palette**: High-contrast scientific aerospace color palette with live CFD surface pressure heatmaps (suction peak in electric cyan, dynamic compression in solar amber, and stall separation in ruby red), specular Blinn-Phong highlights, and authentic liveries.

### 3. Real-Time Aerodynamic Lift Breakdown & 3D Force Vectors
- **3D Spatial Force Vectors**: Live 3D Lift (vibrant emerald, turns crimson in stall with buffet shake) and Drag (solar amber) force vectors anchored directly to the aircraft's aerodynamic center ($AC$), dynamically scaling in length with real-time force magnitude in kilonewtons ($kN$) and live force labels.
- **Dynamic Control Surfaces & Airframe Physics**:
  - F-22 Raptor all-moving horizontal tailerons pitch dynamically with Angle of Attack to simulate trim.
  - Boeing 787 supercritical wings exhibit upward aeroelastic wing flex under lift load and trailing Fowler flaps deploy in real time.
  - Concorde SST droop nose automatically drops on low-speed approach.
  - Supersonic Pratt & Whitney and Olympus engine exhausts with animated Mach shock diamond discs.
- **Surface Pressure Distribution Split**: Visual dual-color meter showing the exact percentage of lift produced by **Upper Surface Bernoulli Suction** ($\sim 70\% - 85\%$) versus **Lower Surface Dynamic Compression** ($\sim 15\% - 30\%$). In stall conditions, the collapse of suction is tracked in real time.
- **Downwash Momentum Deflection (Newton's 3rd Law)**: Computes the downwash deflection angle ($\epsilon = \frac{2 C_L}{\pi AR}$), demonstrating how downward momentum imparted to the airstream creates an equal and opposite upward lift force.
- **Net Vertical Vector**: Real-time climb/descent vector in Newtons ($N$) and kilonewtons ($kN$).

### 4. Live Telemetry HUD & CSV Data Export
- **Flight Instruments**:
  - Lift Coefficient ($C_L$) and Total Lift Force ($N$)
  - Drag Coefficient ($C_D$) and Total Drag Force ($N$)
  - Aerodynamic Efficiency ($L/D$) & Glide Ratio
  - Mach Number ($M$) & Speed Regime (Subsonic, Transonic, Supersonic)
  - Dynamic Pressure ($q = \frac{1}{2} \rho V^2$) in kPa
  - Reynolds Number ($Re = \frac{\rho V c}{\mu}$)
  - Boundary Layer Status & Critical Stall Margin Indicator
- **CSV Data Export**: One-click download of the complete simulation state and aerodynamic parameters with automatic toast confirmation.
- **Keyboard Shortcuts**:
  - `Space`: Pause / Resume simulation
  - `↑` / `↓`: Pitch Angle of Attack ($\pm 0.5^\circ$)
  - `←` / `→`: Inflow Airspeed ($\pm 15\text{ kts}$)
  - `M`: Toggle procedural wind tunnel sound
  - `R`: Reset to default parameters

### 5. Aerodynamic Polar Curves
- **Lift Curve ($C_L$ vs $\alpha$)**: Live operating point indicator, zero-lift axis, and critical stall margin band.
- **Drag Polar ($C_L$ vs $C_D$)**: Parabolic induced drag curve and maximum $L/D$ tangent line.
- **Chordwise Pressure Distribution ($C_p$ vs $x/c$)**: Upper surface suction peak vs lower surface dynamic pressure.

### 6. Procedural Wind Tunnel Audio
- Synthesizes realistic pink/brown noise wind rush via the Web Audio API that dynamically adjusts with airspeed, Mach number, and stall buffet vibration (with mute/unmute control).

---

## Governing Physical Equations

| Principle | Formula | Notes |
| :--- | :--- | :--- |
| **Lift Force** | $L = \frac{1}{2} \rho V^2 S C_L$ | $\rho$ is air density, $V$ is true airspeed, $S$ is wing area |
| **Drag Polar** | $C_D = C_{D0} + \frac{C_L^2}{\pi e AR}$ | Sum of parasitic drag and lift-induced drag |
| **Dynamic Pressure** | $q = \frac{1}{2} \rho V^2$ | Stagnation kinetic energy per unit volume |
| **Reynolds Number** | $Re = \frac{\rho V c}{\mu}$ | Ratio of inertial forces to viscous shear forces |
| **Bernoulli Equation** | $P + \frac{1}{2}\rho V^2 = \text{constant}$ | Explains suction acceleration over the upper wing crest |
| **Downwash Angle** | $\epsilon = \frac{2 C_L}{\pi AR}$ | Downward flow momentum angle (rad) |
| **Mach Cone Angle** | $\mu = \arcsin\left(\frac{1}{M}\right)$ | Half-angle of supersonic oblique shockwave |

---

## Tech Stack

- **Framework**: React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Graphics**: HTML5 Canvas 2D + Custom 3D Matrix Projection Engine (Hardware-agnostic, zero WebGL driver crash risk)
- **Audio**: Web Audio API (procedural pink noise filter synthesis)
- **Build Tool**: Vite

---

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── AeroCharts.tsx            # Polar curves (CL-alpha, drag polar, Cp)
│   │   ├── AeroTheoryModal.tsx       # Flight physics educational guide
│   │   ├── ControlsDeck.tsx          # Model selector, AoA slider, presets
│   │   ├── TelemetryHUD.tsx          # Real-time HUD, lift breakdown, CSV export
│   │   ├── WindTunnelCanvas.tsx      # 2D Navier-Stokes fluid grid solver
│   │   └── WindTunnelCanvas3D.tsx    # 3D Wind tunnel with spatial aircraft model
│   ├── engine/
│   │   └── FluidSolver.ts            # Stam 2D Navier-Stokes solver implementation
│   ├── types/
│   │   └── aerodynamics.ts           # Aerodynamic types, models, telemetry data
│   ├── utils/
│   │   ├── aircraft3DGeometry.ts     # 3D polygon meshes for F-22, 787, Concorde
│   │   ├── airfoilGenerators.ts      # NACA formulas, polar math, atmosphere model
│   │   └── audio.ts                  # Web Audio wind tunnel engine
│   ├── App.tsx                       # Main application shell
│   ├── main.tsx                      # Entry point
│   └── index.css                     # Global design tokens and Tailwind setup
├── index.html                        # HTML entry point
├── metadata.json                     # Application configuration
└── package.json                      # Project dependencies and scripts
```

---

## Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

3. **Build for production**:
   ```bash
   npm run build
   ```

4. **Verify TypeScript compilation**:
   ```bash
   npm run lint
   ```

---

## License

Apache-2.0
