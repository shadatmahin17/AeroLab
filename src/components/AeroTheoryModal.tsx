import React from 'react';
import { X, BookOpen, Compass, AlertTriangle, Wind, Zap } from 'lucide-react';

interface AeroTheoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AeroTheoryModal: React.FC<AeroTheoryModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white tracking-wide font-sans">
              Aerodynamics & Flight Physics Field Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto space-y-6 text-sm text-slate-300 leading-relaxed font-sans">
          {/* Section 1: How Lift Works */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold mb-2">
              <Compass className="w-4 h-4" />
              <h3>1. How Wings Produce Lift: Bernoulli & Downwash</h3>
            </div>
            <p className="text-slate-300 mb-2.5">
              Lift is produced by the net pressure imbalance across the upper and lower surfaces of the airfoil, combined with downward momentum imparted to the airstream (downwash):
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
              <li>
                <strong className="text-slate-200">Upper Surface Suction:</strong> Air flowing over the curved suction side accelerates due to streamline convergence. According to Bernoulli&apos;s principle (P + ½·ρ·V² = constant), increased local velocity creates a powerful low-pressure suction field (Cp &lt; 0).
              </li>
              <li>
                <strong className="text-slate-200">Newton&apos;s Third Law (Downwash):</strong> As the wing moves forward at an angle of attack (α), the airflow is deflected downwards. The reaction force pushes the wing upward.
              </li>
              <li>
                <strong className="text-slate-200">Kutta Condition:</strong> Flow leaves the sharp trailing edge smoothly, locking in circulation (Γ) around the wing.
              </li>
            </ul>
          </div>

          {/* Section 2: Aerodynamic Stall */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
              <AlertTriangle className="w-4 h-4" />
              <h3>2. Aerodynamic Stall &amp; Boundary Layer Separation</h3>
            </div>
            <p className="text-slate-300 mb-2">
              A stall is <em>not</em> an engine failure—it is a loss of lift caused by exceeding the <strong>critical angle of attack</strong> (α_crit ≈ 14° - 18°):
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
              <li>
                As α increases, air on the upper surface encounters an increasingly harsh <strong>adverse pressure gradient</strong> (pressure rising toward the trailing edge).
              </li>
              <li>
                The slowed boundary layer loses kinetic energy, separates from the wing skin, and forms an unsteady, turbulent recirculation bubble.
              </li>
              <li>
                Suction collapses, causing a sharp drop in CL and a massive surge in separation drag (CD).
              </li>
            </ul>
          </div>

          {/* Section 3: Supersonic Flow & Shockwaves */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-amber-400 font-semibold mb-2">
              <Zap className="w-4 h-4" />
              <h3>3. Transonic Flight, Mach Numbers &amp; Shockwaves</h3>
            </div>
            <p className="text-slate-300 mb-2">
              The <strong>Mach number</strong> is the ratio of aircraft speed to the local speed of sound (M = V / a):
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
              <li>
                <strong className="text-slate-200">Subsonic (M &lt; 0.8):</strong> Pressure disturbances propagate ahead of the aircraft, smoothly parting the air.
              </li>
              <li>
                <strong className="text-slate-200">Transonic (0.8 ≤ M ≤ 1.2):</strong> Local airflow over the wing crest accelerates to supersonic speeds even while the airplane is subsonic, causing normal shockwaves and wave drag.
              </li>
              <li>
                <strong className="text-slate-200">Supersonic (M &gt; 1.0):</strong> The aircraft travels faster than sound waves can propagate forward. Pressure disturbances coalesce into an oblique <strong>Mach Cone</strong> with angle μ = arcsin(1/M).
              </li>
            </ul>
          </div>

          {/* Section 4: Key Formulas */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold mb-2">
              <Wind className="w-4 h-4" />
              <h3>4. Governing Aerodynamic Equations</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1 font-sans">Lift Equation:</span>
                <span className="text-cyan-300 font-bold">L = ½ · ρ · V² · S · CL</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1 font-sans">Drag Polar:</span>
                <span className="text-amber-300 font-bold">CD = CD0 + (CL² / π·e·AR)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1 font-sans">Dynamic Pressure:</span>
                <span className="text-emerald-300 font-bold">q = ½ · ρ · V²</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block mb-1 font-sans">Reynolds Number:</span>
                <span className="text-indigo-300 font-bold">Re = (ρ · V · c) / μ</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
