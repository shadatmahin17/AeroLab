import { Point2D } from '../types/aerodynamics';
import { isPointInPolygon } from '../utils/airfoilGenerators';

export interface FluidParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  color: string;
  size: number;
}

export class FluidSolver {
  public nx: number;
  public ny: number;
  public size: number;
  public iter = 8; // Higher accuracy for incompressibility

  // Velocity buffers
  public u: Float32Array;
  public v: Float32Array;
  public u_prev: Float32Array;
  public v_prev: Float32Array;

  // Dye / Smoke density
  public dens: Float32Array;
  public dens_prev: Float32Array;

  // Pressure & Divergence
  public p: Float32Array;
  public div: Float32Array;

  // Obstacle mask (1 = inside aircraft, 0 = fluid)
  public mask: Uint8Array;
  public boundaryDist: Float32Array;

  // Flow particles
  public particles: FluidParticle[] = [];
  public maxParticles = 900;

  constructor(nx = 76, ny = 44) {
    this.nx = nx;
    this.ny = ny;
    this.size = (nx + 2) * (ny + 2);

    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.u_prev = new Float32Array(this.size);
    this.v_prev = new Float32Array(this.size);

    this.dens = new Float32Array(this.size);
    this.dens_prev = new Float32Array(this.size);

    this.p = new Float32Array(this.size);
    this.div = new Float32Array(this.size);

    this.mask = new Uint8Array(this.size);
    this.boundaryDist = new Float32Array(this.size);

    this.initParticles(800, 500);
  }

  public IX(i: number, j: number): number {
    return i + (this.nx + 2) * j;
  }

  public reset(inflowVel = 1.0) {
    this.u.fill(inflowVel);
    this.v.fill(0);
    this.u_prev.fill(0);
    this.v_prev.fill(0);
    this.dens.fill(0);
    this.dens_prev.fill(0);
    this.p.fill(0);
    this.div.fill(0);

    for (const p of this.particles) {
      p.x = Math.random() * 800;
      p.y = Math.random() * 500;
      p.vx = inflowVel;
      p.vy = 0;
      p.age = Math.random() * p.maxAge;
    }
  }

  public initParticles(width: number, height: number) {
    this.particles = [];
    const colors = ['#00f0ff', '#38bdf8', '#0ea5e9', '#34d399', '#60a5fa', '#a7f3d0', '#fbbf24'];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 1.0,
        vy: 0,
        age: Math.random() * 300,
        maxAge: 200 + Math.random() * 200,
        color: colors[i % colors.length],
        size: 1.2 + Math.random() * 1.8,
      });
    }
  }

  /**
   * Rasterize aircraft polygon into the simulation grid
   */
  public updateObstacleMask(polygon: Point2D[], width: number, height: number) {
    this.mask.fill(0);
    if (!polygon || polygon.length < 3) return;

    const cellW = width / this.nx;
    const cellH = height / this.ny;

    for (let i = 1; i <= this.nx; i++) {
      const px = (i - 0.5) * cellW;
      for (let j = 1; j <= this.ny; j++) {
        const py = (j - 0.5) * cellH;
        if (isPointInPolygon(px, py, polygon)) {
          this.mask[this.IX(i, j)] = 1;
        }
      }
    }
  }

  private set_bnd(b: number, x: Float32Array) {
    const { nx, ny } = this;

    for (let i = 1; i <= nx; i++) {
      // Top and bottom boundaries (solid wind tunnel walls)
      x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
      x[this.IX(i, ny + 1)] = b === 2 ? -x[this.IX(i, ny)] : x[this.IX(i, ny)];
    }

    for (let j = 1; j <= ny; j++) {
      // Inflow left boundary
      x[this.IX(0, j)] = b === 1 ? x[this.IX(1, j)] : x[this.IX(1, j)];
      // Outflow right boundary (open convective outflow)
      x[this.IX(nx + 1, j)] = b === 1 ? x[this.IX(nx, j)] : x[this.IX(nx, j)];
    }

    // Corner smoothing
    x[this.IX(0, 0)] = 0.5 * (x[this.IX(1, 0)] + x[this.IX(0, 1)]);
    x[this.IX(0, ny + 1)] = 0.5 * (x[this.IX(1, ny + 1)] + x[this.IX(0, ny)]);
    x[this.IX(nx + 1, 0)] = 0.5 * (x[this.IX(nx, 0)] + x[this.IX(nx + 1, 1)]);
    x[this.IX(nx + 1, ny + 1)] = 0.5 * (x[this.IX(nx, ny + 1)] + x[this.IX(nx + 1, ny)]);

    // Aircraft body internal no-slip boundary enforcement
    for (let i = 1; i <= nx; i++) {
      for (let j = 1; j <= ny; j++) {
        const idx = this.IX(i, j);
        if (this.mask[idx] === 1) {
          x[idx] = 0;
        }
      }
    }
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
    const { nx, ny } = this;
    const a = dt * diff * nx * ny;
    const denom = 1 + 4 * a;

    for (let k = 0; k < this.iter; k++) {
      for (let i = 1; i <= nx; i++) {
        for (let j = 1; j <= ny; j++) {
          const idx = this.IX(i, j);
          if (this.mask[idx] === 1) {
            x[idx] = 0;
            continue;
          }
          x[idx] = (x0[idx] + a * (
            x[this.IX(i - 1, j)] +
            x[this.IX(i + 1, j)] +
            x[this.IX(i, j - 1)] +
            x[this.IX(i, j + 1)]
          )) / denom;
        }
      }
      this.set_bnd(b, x);
    }
  }

  private advect(b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array, dt: number) {
    const { nx, ny } = this;
    const dt0_x = dt * nx;
    const dt0_y = dt * ny;

    for (let i = 1; i <= nx; i++) {
      for (let j = 1; j <= ny; j++) {
        const idx = this.IX(i, j);
        if (this.mask[idx] === 1) {
          d[idx] = 0;
          continue;
        }

        let x = i - dt0_x * u[idx];
        let y = j - dt0_y * v[idx];

        if (x < 0.5) x = 0.5;
        if (x > nx + 0.5) x = nx + 0.5;
        const i0 = Math.floor(x);
        const i1 = i0 + 1;

        if (y < 0.5) y = 0.5;
        if (y > ny + 0.5) y = ny + 0.5;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;

        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;

        d[idx] =
          s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
          s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);
      }
    }
    this.set_bnd(b, d);
  }

  private project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
    const { nx, ny } = this;
    const hx = 1.0 / nx;
    const hy = 1.0 / ny;

    for (let i = 1; i <= nx; i++) {
      for (let j = 1; j <= ny; j++) {
        const idx = this.IX(i, j);
        if (this.mask[idx] === 1) {
          div[idx] = 0;
          p[idx] = 0;
          continue;
        }
        div[idx] = -0.5 * (
          hx * (u[this.IX(i + 1, j)] - u[this.IX(i - 1, j)]) +
          hy * (v[this.IX(i, j + 1)] - v[this.IX(i, j - 1)])
        );
        p[idx] = 0;
      }
    }

    this.set_bnd(0, div);
    this.set_bnd(0, p);

    for (let k = 0; k < this.iter; k++) {
      for (let i = 1; i <= nx; i++) {
        for (let j = 1; j <= ny; j++) {
          const idx = this.IX(i, j);
          if (this.mask[idx] === 1) {
            p[idx] = 0;
            continue;
          }
          p[idx] = (div[idx] + p[this.IX(i - 1, j)] + p[this.IX(i + 1, j)] + p[this.IX(i, j - 1)] + p[this.IX(i, j + 1)]) / 4;
        }
      }
      this.set_bnd(0, p);
    }

    for (let i = 1; i <= nx; i++) {
      for (let j = 1; j <= ny; j++) {
        const idx = this.IX(i, j);
        if (this.mask[idx] === 1) {
          u[idx] = 0;
          v[idx] = 0;
          continue;
        }
        u[idx] -= 0.5 * (p[this.IX(i + 1, j)] - p[this.IX(i - 1, j)]) / hx;
        v[idx] -= 0.5 * (p[this.IX(i, j + 1)] - p[this.IX(i, j - 1)]) / hy;
      }
    }

    this.set_bnd(1, u);
    this.set_bnd(2, v);
  }

  /**
   * Main step execution
   */
  public step(
    inflowVel: number,
    viscosity: number,
    smokeDensity: number,
    aoaDeg: number,
    isStalled: boolean,
    dt = 0.12
  ) {
    const { nx, ny } = this;

    // Continuous Inflow on Left Boundary
    for (let j = 1; j <= ny; j++) {
      const idx1 = this.IX(1, j);
      const idx2 = this.IX(2, j);

      this.u_prev[idx1] = inflowVel;
      this.u_prev[idx2] = inflowVel;
      this.v_prev[idx1] = 0;
      this.v_prev[idx2] = 0;

      // Inject clean laminar smoke streamlines at regular vertical intervals (every 3rd or 4th line)
      if (j % 3 === 0) {
        this.dens_prev[idx1] = smokeDensity * 8.0;
      }
    }

    // Aerodynamic Circulation & Wake Induction
    // At positive angle of attack, induce bound vortex circulation (downwash behind trailing edge, upwash at leading edge)
    const liftCirculation = Math.sin((aoaDeg * Math.PI) / 180) * inflowVel * 0.45;
    const midX = Math.floor(nx * 0.45);
    const midY = Math.floor(ny * 0.5);

    // Apply circulation upwash/downwash around the model
    for (let i = Math.max(1, midX - 14); i <= Math.min(nx, midX + 14); i++) {
      for (let j = Math.max(1, midY - 10); j <= Math.min(ny, midY + 10); j++) {
        const dx = i - midX;
        const dy = j - midY;
        const distSq = dx * dx + dy * dy;
        if (distSq > 4 && distSq < 140) {
          // Vortex tangential velocity field
          const r = Math.sqrt(distSq);
          const vTan = (liftCirculation * 6.0) / (r + 1.0);
          this.u_prev[this.IX(i, j)] += (dy / r) * vTan * 0.15;
          this.v_prev[this.IX(i, j)] -= (dx / r) * vTan * 0.15;
        }
      }
    }

    // In stall condition, inject periodic shedding vortices behind the upper surface
    if (isStalled) {
      const wakeX = Math.floor(nx * 0.55);
      const wakeY = Math.floor(ny * 0.45);
      const timeFactor = Date.now() * 0.008;
      const swirl = Math.sin(timeFactor) * inflowVel * 1.4;

      for (let i = wakeX; i <= Math.min(nx - 2, wakeX + 8); i++) {
        for (let j = Math.max(2, wakeY - 4); j <= Math.min(ny - 2, wakeY + 4); j++) {
          this.v_prev[this.IX(i, j)] += swirl * 0.5;
          this.u_prev[this.IX(i, j)] -= Math.abs(swirl) * 0.3; // Reverse flow in separation bubble!
        }
      }
    }

    // Add sources
    for (let i = 0; i < this.size; i++) {
      this.u[i] += dt * this.u_prev[i];
      this.v[i] += dt * this.v_prev[i];
      this.dens[i] += dt * this.dens_prev[i];
    }
    this.u_prev.fill(0);
    this.v_prev.fill(0);
    this.dens_prev.fill(0);

    // Viscous Velocity Diffusion
    const visc = Math.max(0.0001, viscosity * 0.005);
    this.diffuse(1, this.u_prev, this.u, visc, dt);
    this.diffuse(2, this.v_prev, this.v, visc, dt);

    // Pressure Projection
    this.project(this.u_prev, this.v_prev, this.u, this.v);

    // Velocity Advection
    this.advect(1, this.u, this.u_prev, this.u_prev, this.v_prev, dt);
    this.advect(2, this.v, this.v_prev, this.u_prev, this.v_prev, dt);

    // Re-project for mass conservation
    this.project(this.u, this.v, this.u_prev, this.v_prev);

    // Smoke Density Diffusion & Advection
    this.diffuse(0, this.dens_prev, this.dens, visc * 0.1, dt);
    this.advect(0, this.dens, this.dens_prev, this.u, this.v, dt);
  }

  /**
   * Sample flow velocity at screen coordinate
   */
  public getVelocityAt(px: number, py: number, width: number, height: number): { u: number; v: number; mag: number } {
    const gx = (px / width) * this.nx;
    const gy = (py / height) * this.ny;

    const i = Math.max(1, Math.min(this.nx, Math.floor(gx)));
    const j = Math.max(1, Math.min(this.ny, Math.floor(gy)));
    const idx = this.IX(i, j);

    const uVal = this.u[idx];
    const vVal = this.v[idx];
    const mag = Math.hypot(uVal, vVal);

    return { u: uVal, v: vVal, mag };
  }

  /**
   * Pressure coefficient Cp = 1 - (V / V_inf)^2 (Bernoulli equation)
   */
  public getPressureCoeffAt(px: number, py: number, width: number, height: number, inflowVel: number): number {
    const vel = this.getVelocityAt(px, py, width, height);
    const vInf = Math.max(0.1, inflowVel);
    const cp = 1 - Math.pow(vel.mag / vInf, 2);
    return Math.max(-3.0, Math.min(1.0, cp));
  }
}
