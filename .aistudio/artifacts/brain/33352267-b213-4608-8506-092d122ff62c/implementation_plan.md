# Telemetry HUD Data & Graph Export Suite

A comprehensive data and graph export suite for the Aerodynamics Simulator and Physics Wind Tunnel, enabling aerospace engineers, students, and researchers to export simulation parameters, forces, aerodynamic coefficients, polar curve sweeps, and high-fidelity vector/raster graphs in standard JSON, CSV, SVG, and PNG formats.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your selections during Phase 1 clarification, the following architecture decisions are locked in for implementation:

- **Dedicated Export Menu**: An integrated dropdown menu in the Telemetry HUD toolbar offering direct options for JSON and CSV downloads, with keyboard accessibility and animated feedback states.
- **Full Snapshot Data Scope**: Export files package complete simulation state, including aircraft geometry (`wingspan`, `chord`, `wing area`, `aspect ratio`), ambient atmospheric properties (`altitude`, `air density`, `speed of sound`, `dynamic pressure`), instantaneous aerodynamic parameters (`AoA`, `Mach`, `Reynolds`, `CL`, `CD`, `L/D`, suction/compression split, downwash angle), and a high-resolution polar curve sweep ($\alpha \in [-15^\circ, +30^\circ]$ at $1.5^\circ$ increments).
- **Graph Visual & Data Export**: The aerodynamic polar visualization deck (`AeroCharts`) will feature one-click SVG vector export, crisp PNG raster export, and raw curve tabular data download for external plotting in MATLAB, Python/Pandas, or Excel.

---

## 1. Overview & Core Concept

- **What It Does**: Equips the telemetry and analytics deck with external analysis export tools. Users can snapshot any aerodynamic wind tunnel run and export either structured machine-readable JSON, spreadsheet-ready CSV, or publication-grade SVG/PNG vector charts.
- **Target Audience / Persona**: Aeronautical engineers, flight simulation enthusiasts, STEM educators, and students who need empirical CFD datasets for lab reports, academic papers, and external validation.
- **Key Value**: Bridges the gap between in-browser real-time simulation and desktop post-processing tools, allowing instantaneous capture of transient aerodynamic behavior, stall transitions, and pressure distributions without external screen-capture or manual transcription.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Snapshotting Simulation State (JSON / CSV)**:
   - The user configures flight conditions (e.g. F-22 Raptor at $M = 0.85$, $12^\circ$ AoA, $15^\circ$ flaps).
   - In the right-hand **Telemetry & Forces** header, the user clicks the **Export Data** dropdown.
   - The menu reveals options:
     - **Full Telemetry Snapshot (JSON)**: Formatted JSON with metadata, aircraft geometry, atmospheric parameters, forces, and polar sweep array.
     - **Tabular Flight Log & Polar (CSV)**: Dual-table CSV structured for instant Excel/Google Sheets opening.
   - Clicking either triggers immediate file download with an auto-generated descriptive filename (`aerolab_f22_aoa+12.0deg_m0.85_YYYYMMDD_HHMMSS.json`).
   - A subtle green status pill confirms the export without modal obstruction.

2. **Graph Vector & Raster Export (SVG / PNG / CSV)**:
   - In the **Aerodynamic Polars & Pressure** deck, next to the $C_L-\alpha$, $C_L-C_D$, and $C_p-x/c$ tabs, an **Export Chart** tool is available.
   - Users can download:
     - **Download SVG**: High-resolution standalone vector asset with embedded styling, coordinate axes, zero-lift references, and operating points.
     - **Download PNG**: Scaled $2\times$ crisp raster graphic on transparent or dark background suitable for slides and documents.
     - **Download Curve Data (CSV)**: The exact $(x, y)$ coordinate points corresponding to the active curve.

### Visual Identity & Theme

- **Palette**: Monochromatic obsidian background (`#060a12`), hairline borders (`border-cyan-500/20`), and laser-cyan accents (`#06b6d4`) matching the scientific telemetry aesthetic.
- **Typography**: Clean tabular monospace (`font-mono tabular-nums text-xs`) for all file sizes, record counts, and timestamps.
- **Menu Styling**: Obsidian glass dropdown (`bg-slate-900/95 border border-slate-700/60 shadow-xl backdrop-blur-md rounded-lg p-1.5`) with hover transitions and clear icon indicators (`FileCode2`, `FileSpreadsheet`, `Image`, `Download`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side Blob Generation vs. Backend Export Route**
  - *Chosen Approach*: Pure client-side dynamic `Blob` generation and synthetic link triggering (`URL.createObjectURL(blob)`).
  - *Why*: Zero network latency, offline functional capability, completely private (user telemetry never leaves the browser), and zero server load.
  - *Alternatives Considered*: Backend Node/Express export endpoint. Rejected due to unnecessary network overhead and loss of offline usability.

- **Decision 2: CSV Dual-Section Architecture**
  - *Chosen Approach*: Formatted multi-table CSV containing a Parameter Metadata section followed by a delimiter-separated polar sweep table (`AoA, CL, CD, L/D, Reynolds, FlowState`).
  - *Why*: Allows external software (Excel, MATLAB `readtable`, Python Pandas `read_csv`) to parse both the single operating point and the entire sweep curve without creating multiple fragmented files.

- **Decision 3: Canvas-Assisted SVG-to-PNG Conversion**
  - *Chosen Approach*: Serialize the active `<svg>` element via `XMLSerializer`, render it into an in-memory HTML5 `<canvas>` at $2\times$ pixel density, and export as `image/png`.
  - *Why*: Produces ultra-sharp, anti-aliased graphics ready for publication and presentations without external dependencies.

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CFD SIMULATION ENGINE                           │
│  (SimulationParams: airspeed, altitude, AoA, flaps, aircraftModel)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│        TelemetryHUD.tsx           │ │          AeroCharts.tsx           │
│  - Real-time KPI Metric Cards     │ │  - Active Tab: CL-α / CL-CD / Cp │
│  - Lift Breakdown Diagnostics     │ │  - Polar Curve Generator          │
│  - [Export Data ▼] Dropdown Menu │ │  - [Export Chart ▼] Action Menu │
└─────────────────┬─────────────────┘ └─────────────────┬─────────────────┘
                  │                                     │
                  │ Trigger                             │ Trigger
                  ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     EXPORT & SERIALIZATION UTILITIES                   │
│                                                                        │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌───────────────┐ │
│  │ exportTelemetryJSON()│  │ exportTelemetryCSV()│  │ exportChart() │ │
│  │ - Full schema snapshot│  │ - Key-value metadata│  │ - SVG Blob    │ │
│  │ - Polar sweep samples│  │ - Polar sweep table │  │ - Canvas PNG  │ │
│  │ - ISO 8601 timestamps│  │ - RFC 4180 escaping │  │ - Raw CSV pts │ │
│  └──────────┬───────────┘  └──────────┬──────────┘  └───────┬───────┘ │
└─────────────┼─────────────────────────┼─────────────────────┼──────────┘
              ▼                         ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      CLIENT FILE DOWNLOAD PIPELINE                     │
│               Blob -> URL.createObjectURL -> <a> download               │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

```typescript
// Complete JSON Export Schema
interface AerodynamicsExportSnapshot {
  version: "1.0.0";
  generator: "Aerodynamics Simulator and Physics Wind Tunnel";
  timestamp: string; // ISO 8601
  aircraft: {
    id: string;
    name: string;
    description: string;
    wingspan_m: number;
    chord_m: number;
    referenceArea_m2: number;
    aspectRatio: number;
    stallAngle_deg: number;
    cd0: number;
    weight_kg: number;
  };
  flightConditions: {
    airspeed_kts: number;
    airspeed_mps: number;
    altitude_ft: number;
    altitude_m: number;
    angle_of_attack_deg: number;
    flaps_deg: number;
    air_density_kg_m3: number;
    speed_of_sound_mps: number;
    mach_number: number;
    dynamic_pressure_pa: number;
    reynolds_number: number;
  };
  telemetryResults: {
    lift_N: number;
    drag_N: number;
    lift_coefficient_cl: number;
    drag_coefficient_cd: number;
    lift_to_drag_ratio: number;
    flow_state: "Laminar" | "Turbulent" | "Separated (Stall)";
    is_stalled: boolean;
    stall_margin_deg: number;
    suction_contribution_pct: number;
    compression_contribution_pct: number;
    downwash_deflection_deg: number;
  };
  polarSweep: Array<{
    aoa_deg: number;
    cl: number;
    cd: number;
    ld_ratio: number;
    is_stalled: boolean;
  }>;
}
```

### Step-by-Step Implementation Sequence

1. **Export Utility Module (`src/utils/telemetryExport.ts`)**:
   - Create clean, modular helper functions:
     - `exportTelemetryJSON(...)`: Formats metadata, aircraft specs, conditions, results, and sweep samples into pretty-printed JSON.
     - `exportTelemetryCSV(...)`: Builds double-table CSV with quoted headers, parameter section, and polar sweep rows.
     - `exportSvgAsFile(...)`: Serializes SVG element to `.svg` file.
     - `exportSvgAsPng(...)`: Uses canvas drawing to generate crisp 300 DPI equivalent PNG file.
     - `exportCurveDataCSV(...)`: Dumps active curve $(x, y)$ coordinate points to CSV.
2. **TelemetryHUD Export Menu (`src/components/TelemetryHUD.tsx`)**:
   - Replace the single CSV button with a responsive dropdown menu toggle.
   - Add items for "Export JSON Snapshot" and "Export CSV Dataset".
   - Include clear visual badges, item descriptions, and animated download confirmation toasts.
3. **AeroCharts Graph Export Controls (`src/components/AeroCharts.tsx`)**:
   - Add a compact export action button next to the chart tabs.
   - Support "Download SVG", "Download PNG", and "Download Active Curve (CSV)".
   - Bind to the active SVG element with clean dimensions, dark background fill, and high-contrast labels.
4. **Verification & Testing**:
   - Test JSON formatting against JSON schema parsers.
   - Verify CSV delimiter handling and Excel compatibility.
   - Verify SVG and PNG image output rendering in standard image viewers.
   - Run `compile_applet` and `lint_applet` to ensure zero compilation or type issues.
