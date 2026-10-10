import { AeroTelemetry, AircraftModelType, SimulationParams } from '../types/aerodynamics';
import { AIRCRAFT_MODELS, calculateAeroTelemetry } from './airfoilGenerators';

export interface ExportDataPayload {
  telemetry: AeroTelemetry;
  aoaDeg: number;
  modelType: AircraftModelType;
  params: SimulationParams;
  suctionPercentage: number;
  compressionPercentage: number;
  downwashDeg: number;
}

export interface PolarSweepPoint {
  aoa_deg: number;
  cl: number;
  cd: number;
  ld_ratio: number;
  lift_N: number;
  drag_N: number;
  is_stalled: boolean;
  flow_state: string;
}

/**
 * Computes a standardized sweep across the operational AoA envelope (-15 deg to +30 deg)
 */
export function generatePolarSweep(
  modelType: AircraftModelType,
  airspeedKts: number,
  altitudeFt: number,
  flapsDeg: number
): PolarSweepPoint[] {
  const sweep: PolarSweepPoint[] = [];
  for (let a = -15; a <= 30; a = Math.round((a + 1.5) * 10) / 10) {
    const pt = calculateAeroTelemetry(modelType, a, airspeedKts, altitudeFt, flapsDeg);
    sweep.push({
      aoa_deg: a,
      cl: parseFloat(pt.cl.toFixed(4)),
      cd: parseFloat(pt.cd.toFixed(4)),
      ld_ratio: parseFloat(pt.ldRatio.toFixed(2)),
      lift_N: Math.round(pt.lift_N),
      drag_N: Math.round(pt.drag_N),
      is_stalled: pt.isStalled,
      flow_state: pt.flowState,
    });
  }
  return sweep;
}

/**
 * Generates and downloads a complete JSON snapshot file.
 */
export function downloadTelemetryJSON(payload: ExportDataPayload): string {
  const currentModel = AIRCRAFT_MODELS[payload.modelType];
  const timestamp = new Date().toISOString();
  const polarSweep = generatePolarSweep(
    payload.modelType,
    payload.params.airspeed_kts,
    payload.params.altitude_ft,
    payload.params.flaps_deg
  );

  const aspectRatio =
    Math.pow(currentModel.wingspan, 2) / (currentModel.wingspan * currentModel.chord);

  const speedOfSoundMps = payload.telemetry.mach > 0.01
    ? (payload.params.airspeed_kts * 0.514444) / payload.telemetry.mach
    : 340.29;

  const jsonSnapshot = {
    version: '1.0.0',
    generator: 'Aerodynamics Simulator and Physics Wind Tunnel',
    timestamp,
    aircraft: {
      id: currentModel.id,
      name: currentModel.name,
      category: currentModel.category,
      description: currentModel.description,
      wingspan_m: currentModel.wingspan,
      chord_m: currentModel.chord,
      reference_area_m2: parseFloat((currentModel.wingspan * currentModel.chord).toFixed(3)),
      aspect_ratio: parseFloat(aspectRatio.toFixed(2)),
      stall_angle_deg: currentModel.stallAngle,
      parasite_drag_coefficient_cd0: currentModel.cd0,
    },
    flightConditions: {
      airspeed_kts: payload.params.airspeed_kts,
      airspeed_mps: parseFloat((payload.params.airspeed_kts * 0.514444).toFixed(3)),
      altitude_ft: payload.params.altitude_ft,
      altitude_m: Math.round(payload.params.altitude_ft * 0.3048),
      angle_of_attack_deg: parseFloat(payload.aoaDeg.toFixed(2)),
      flaps_deg: payload.params.flaps_deg,
      air_density_kg_m3: parseFloat(payload.telemetry.air_density_kg_m3.toFixed(5)),
      speed_of_sound_mps: parseFloat(speedOfSoundMps.toFixed(2)),
      mach_number: parseFloat(payload.telemetry.mach.toFixed(3)),
      dynamic_pressure_pa: Math.round(payload.telemetry.dynamic_pressure_pa),
      reynolds_number: payload.telemetry.reynolds,
    },
    telemetryResults: {
      lift_force_N: Math.round(payload.telemetry.lift_N),
      drag_force_N: Math.round(payload.telemetry.drag_N),
      lift_coefficient_cl: parseFloat(payload.telemetry.cl.toFixed(4)),
      drag_coefficient_cd: parseFloat(payload.telemetry.cd.toFixed(4)),
      lift_to_drag_ratio: parseFloat(payload.telemetry.ldRatio.toFixed(2)),
      boundary_flow_state: payload.telemetry.flowState,
      is_stalled: payload.telemetry.isStalled,
      stall_margin_deg: parseFloat(payload.telemetry.stallMargin.toFixed(2)),
      upper_surface_suction_contribution_pct: parseFloat(payload.suctionPercentage.toFixed(1)),
      lower_surface_compression_contribution_pct: parseFloat(
        payload.compressionPercentage.toFixed(1)
      ),
      downwash_deflection_deg: parseFloat(payload.downwashDeg.toFixed(2)),
    },
    polarSweepEnvelope: polarSweep,
  };

  const jsonString = JSON.stringify(jsonSnapshot, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const fileName = `aerolab_${currentModel.id}_aoa${payload.aoaDeg >= 0 ? '+' : ''}${payload.aoaDeg.toFixed(1)}deg_m${payload.telemetry.mach.toFixed(2)}.json`;

  triggerDownload(blob, fileName);
  return fileName;
}

/**
 * Generates and downloads a multi-table CSV file containing operational parameters
 * and a full aerodynamic polar sweep.
 */
export function downloadTelemetryCSV(payload: ExportDataPayload): string {
  const currentModel = AIRCRAFT_MODELS[payload.modelType];
  const timestamp = new Date().toISOString();
  const polarSweep = generatePolarSweep(
    payload.modelType,
    payload.params.airspeed_kts,
    payload.params.altitude_ft,
    payload.params.flaps_deg
  );

  const aspectRatio =
    Math.pow(currentModel.wingspan, 2) / (currentModel.wingspan * currentModel.chord);

  // Section 1: Snapshot flight parameters
  const paramRows: [string, string, string, string][] = [
    ['# SECTION 1: INSTANTANEOUS FLIGHT SNAPSHOT', '', '', ''],
    ['Metric', 'Value', 'Unit', 'Description'],
    ['Timestamp', timestamp, 'ISO 8601', 'Simulation capture timestamp'],
    ['Model Identifier', currentModel.id, '-', 'Aircraft model ID'],
    ['Model Full Name', currentModel.name, '-', 'Aircraft designation'],
    ['Category', currentModel.category, '-', 'Aircraft category classification'],
    ['Wingspan', currentModel.wingspan.toString(), 'm', 'Wing tip to tip distance'],
    ['Mean Aerodynamic Chord', currentModel.chord.toString(), 'm', 'Average wing chord length'],
    ['Reference Wing Area', (currentModel.wingspan * currentModel.chord).toFixed(2), 'm2', 'Aerodynamic planform area'],
    ['Aspect Ratio', aspectRatio.toFixed(2), '-', 'Wing aspect ratio b^2 / S'],
    ['Angle of Attack (alpha)', payload.aoaDeg.toFixed(2), 'deg', 'Wing chord to relative wind angle'],
    ['Airspeed', payload.params.airspeed_kts.toFixed(1), 'knots', 'Indicated wind tunnel airspeed'],
    ['True Airspeed (Metric)', (payload.params.airspeed_kts * 0.514444).toFixed(2), 'm/s', 'True flow airspeed'],
    ['Mach Number', payload.telemetry.mach.toFixed(3), 'M', 'Speed ratio to local sound velocity'],
    ['Test Altitude', payload.params.altitude_ft.toString(), 'ft', 'Atmospheric test altitude'],
    ['Test Altitude (Metric)', Math.round(payload.params.altitude_ft * 0.3048).toString(), 'm', 'Altitude in meters'],
    ['Air Density (rho)', payload.telemetry.air_density_kg_m3.toFixed(5), 'kg/m3', 'Atmospheric mass density'],
    ['Speed of Sound (a)', (payload.telemetry.mach > 0.01 ? (payload.params.airspeed_kts * 0.514444) / payload.telemetry.mach : 340.29).toFixed(2), 'm/s', 'Local speed of sound'],
    ['Dynamic Pressure (q)', Math.round(payload.telemetry.dynamic_pressure_pa).toString(), 'Pa', 'Kinetic energy per unit volume'],
    ['Reynolds Number (Re)', payload.telemetry.reynolds.toString(), '-', 'Inertial to viscous force ratio'],
    ['Trailing Flaps Deflection', payload.params.flaps_deg.toString(), 'deg', 'High-lift flap angle'],
    ['Lift Coefficient (CL)', payload.telemetry.cl.toFixed(4), '-', 'Dimensionless lift coefficient'],
    ['Drag Coefficient (CD)', payload.telemetry.cd.toFixed(4), '-', 'Dimensionless drag coefficient'],
    ['Aerodynamic Efficiency (L/D)', payload.telemetry.ldRatio.toFixed(2), ':1', 'Lift-to-drag glide ratio'],
    ['Total Aerodynamic Lift', Math.round(payload.telemetry.lift_N).toString(), 'N', 'Vertical aerodynamic lift force'],
    ['Total Aerodynamic Drag', Math.round(payload.telemetry.drag_N).toString(), 'N', 'Horizontal aerodynamic drag force'],
    ['Boundary Flow State', payload.telemetry.flowState, '-', 'Laminar / Turbulent / Separation state'],
    ['Stall Status', payload.telemetry.isStalled ? 'STALLED' : 'ATTACHED', '-', 'Stall flag'],
    ['Stall Margin', payload.telemetry.stallMargin.toFixed(2), 'deg', 'Margin before critical separation'],
    ['Upper Surface Suction Contribution', payload.suctionPercentage.toFixed(1), '%', 'Bernoulli suction pressure contribution'],
    ['Lower Surface Compression Contribution', payload.compressionPercentage.toFixed(1), '%', 'Dynamic ram pressure contribution'],
    ['Downwash Deflection Angle', payload.downwashDeg.toFixed(2), 'deg', 'Downward momentum deflection of flow']
  ];

  // Section 2: Polar sweep table
  const sweepHeader: string[] = [
    '# SECTION 2: AERODYNAMIC POLAR SWEEP (-15 deg to +30 deg)',
    '',
    '',
    '',
    '',
    '',
    ''
  ];
  const sweepCols = ['AoA (deg)', 'Lift Coeff (CL)', 'Drag Coeff (CD)', 'Glide Ratio (L/D)', 'Lift Force (N)', 'Drag Force (N)', 'Flow State'];
  const sweepRows = polarSweep.map((pt) => [
    pt.aoa_deg.toFixed(1),
    pt.cl.toFixed(4),
    pt.cd.toFixed(4),
    pt.ld_ratio.toFixed(2),
    pt.lift_N.toString(),
    pt.drag_N.toString(),
    pt.is_stalled ? `STALL (${pt.flow_state})` : pt.flow_state,
  ]);

  const escapeCell = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const formatRows = (rows: string[][]) =>
    rows.map((row) => row.map(escapeCell).join(',')).join('\n');

  const csvContent = [
    formatRows(paramRows),
    '',
    sweepHeader.map(escapeCell).join(','),
    sweepCols.map(escapeCell).join(','),
    formatRows(sweepRows),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `aerolab_${currentModel.id}_aoa${payload.aoaDeg >= 0 ? '+' : ''}${payload.aoaDeg.toFixed(1)}deg_m${payload.telemetry.mach.toFixed(2)}.csv`;

  triggerDownload(blob, fileName);
  return fileName;
}

/**
 * Exports an SVG element directly as a vector .svg file.
 */
export function downloadSvgElement(svgElement: SVGSVGElement, baseName: string): string {
  // Clone to avoid modifying the DOM
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // Ensure attributes for standalone rendering
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Insert background if none exists
  const existingRect = clone.querySelector('rect.export-bg');
  if (!existingRect) {
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', '#070b14');
    clone.insertBefore(bgRect, clone.firstChild);
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const fileName = `${baseName}.svg`;

  triggerDownload(blob, fileName);
  return fileName;
}

/**
 * Renders an SVG element into an in-memory Canvas at high DPI and downloads as PNG.
 */
export function downloadSvgAsPng(
  svgElement: SVGSVGElement,
  baseName: string,
  pixelRatio: number = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const clone = svgElement.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Ensure dark background rect
      const existingRect = clone.querySelector('rect.export-bg');
      if (!existingRect) {
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', '#070b14');
        clone.insertBefore(bgRect, clone.firstChild);
      }

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const viewBox = svgElement.viewBox.baseVal;
      const width = (viewBox && viewBox.width > 0 ? viewBox.width : svgElement.clientWidth || 440) * pixelRatio;
      const height = (viewBox && viewBox.height > 0 ? viewBox.height : svgElement.clientHeight || 190) * pixelRatio;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        // Fill background
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, width, height);

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          const fileName = `${baseName}.png`;
          triggerDownload(blob, fileName);
          resolve(fileName);
        }, 'image/png');
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Exports discrete curve point coordinates to CSV.
 */
export function downloadCurveDataCSV(
  points: Array<{ x: number; y: number; label?: string }>,
  xName: string,
  yName: string,
  baseName: string
): string {
  const header = `"${xName}","${yName}","Status/Label"`;
  const rows = points.map(
    (pt) => `"${pt.x.toFixed(4)}","${pt.y.toFixed(4)}","${pt.label || ''}"`
  );
  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `${baseName}_data.csv`;

  triggerDownload(blob, fileName);
  return fileName;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
