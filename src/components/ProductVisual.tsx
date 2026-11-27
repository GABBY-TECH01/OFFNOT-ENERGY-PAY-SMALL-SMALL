import React, { useEffect, useState } from 'react';
import {
  BatteryCharging,
  Cable,
  Cpu,
  ShieldCheck,
  Sun,
  Zap,
  Package,
} from 'lucide-react';
import type { ProductCategory } from '../types';

interface ProductVisualProps {
  imageUrl?: string;
  alt: string;
  category?: ProductCategory | 'Solar Package';
  capacityLabel?: string;
  className?: string;
}

export function ProductVisual({
  imageUrl,
  alt,
  category = 'Solar Package',
  capacityLabel,
  className = 'w-full h-56',
}: ProductVisualProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  if (imageUrl && !imgError) {
    const isStudioProduct =
      imageUrl.startsWith('/assets/products/') &&
      !imageUrl.includes('solar_package');
    return (
      <div
        className={`relative overflow-hidden ${
          isStudioProduct
            ? 'bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-3 flex items-center justify-center'
            : 'bg-slate-50 dark:bg-slate-900'
        } ${className}`}
      >
        <img
          src={imageUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`w-full h-full transition-transform duration-300 group-hover:scale-[1.03] ${
            isStudioProduct ? 'object-contain rounded-lg bg-white' : 'object-cover'
          }`}
        />
      </div>
    );
  }

  const getIconAndAccent = () => {
    switch (category) {
      case 'Hybrid Inverters':
        return { Icon: Cpu, label: 'HYBRID INVERTER', accent: 'text-emerald-700 dark:text-emerald-400', bg: 'from-emerald-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30' };
      case 'Lithium Batteries':
      case 'Tubular Batteries':
        return { Icon: BatteryCharging, label: category.toUpperCase(), accent: 'text-emerald-700 dark:text-emerald-400', bg: 'from-slate-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30' };
      case 'Solar Panels':
        return { Icon: Sun, label: 'PHOTOVOLTAIC ARRAY', accent: 'text-orange-600 dark:text-orange-400', bg: 'from-orange-50/60 via-white to-emerald-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-orange-950/20' };
      case 'Solar Generators':
      case 'Portable Power Stations':
        return { Icon: Zap, label: category.toUpperCase(), accent: 'text-orange-600 dark:text-orange-400', bg: 'from-slate-50 via-white to-orange-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-orange-950/20' };
      case 'Solar Cables':
        return { Icon: Cable, label: 'SOLAR DC CABLING', accent: 'text-slate-700 dark:text-slate-300', bg: 'from-slate-100 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800' };
      case 'Surge Protection Devices':
        return { Icon: ShieldCheck, label: 'SURGE PROTECTION', accent: 'text-emerald-700 dark:text-emerald-400', bg: 'from-emerald-50/70 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30' };
      case 'Solar Accessories':
        return { Icon: Package, label: 'SOLAR ACCESSORIES', accent: 'text-slate-700 dark:text-slate-300', bg: 'from-slate-50 via-white to-emerald-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800' };
      default:
        return { Icon: Sun, label: 'COMPLETE SOLAR SYSTEM', accent: 'text-emerald-700 dark:text-emerald-400', bg: 'from-emerald-50 via-white to-orange-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30' };
    }
  };

  const { Icon, label, accent, bg } = getIconAndAccent();

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${bg} border-b border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center p-6 ${className}`}
    >
      {/* Subtle architectural grid backdrop */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full opacity-[0.07] dark:opacity-[0.12] text-emerald-900 dark:text-emerald-400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="solar-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#solar-grid)" />
      </svg>

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-sm flex items-center justify-center mb-3">
          <Icon className={`w-8 h-8 ${accent}`} strokeWidth={1.75} />
        </div>
        <span className="text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">
          {capacityLabel ? `${capacityLabel} · ${label}` : label}
        </span>
      </div>
    </div>
  );
}

export function HeroSolarIllustration() {
  return (
    <div className="relative w-full h-full min-h-[300px] sm:min-h-[340px] lg:min-h-[460px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-6 sm:p-8 flex flex-col justify-between shadow-lg">
      {/* Architectural solar vector schematic */}
      <svg
        aria-hidden="true"
        viewBox="0 0 640 400"
        className="w-full h-auto max-h-[280px] mx-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Warm sun arc */}
        <circle cx="510" cy="86" r="44" fill="#ea580c" fillOpacity="0.22" />
        <circle cx="510" cy="86" r="28" fill="#f59e0b" />
        {/* Solar rooftop array */}
        <path d="M70 235 L250 135 L465 185 L285 285 Z" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
        <path d="M115 210 L330 260" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M160 185 L375 235" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M205 160 L420 210" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M140 195 L220 248" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M210 158 L295 215" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d="M280 142 L365 198" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.5" />
        {/* Modern home structure */}
        <path d="M95 245 L285 335 L445 255 L445 345 L285 390 L95 320 Z" fill="#1e293b" stroke="#475569" strokeWidth="1.5" />
        {/* Inverter & Battery unit on wall */}
        <rect x="310" y="275" width="46" height="58" rx="4" fill="#15803d" stroke="#86efac" strokeWidth="1.5" />
        <rect x="366" y="285" width="38" height="48" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
        {/* Clean energy flow line */}
        <path d="M333 255 L333 275" stroke="#22c55e" strokeWidth="2.5" strokeDasharray="4 4" />
        <path d="M356 305 L366 305" stroke="#f59e0b" strokeWidth="2.5" />
      </svg>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10 text-white">
        <div>
          <p className="text-[11px] text-emerald-300 font-medium">Payment Term</p>
          <p className="text-sm sm:text-base font-bold font-mono-num">Up to 5 Months</p>
        </div>
        <div>
          <p className="text-[11px] text-amber-300 font-medium">Ibadan Branches</p>
          <p className="text-sm sm:text-base font-bold">Dugbe & Dalute</p>
        </div>
        <div>
          <p className="text-[11px] text-emerald-300 font-medium">Delivery Policy</p>
          <p className="text-sm sm:text-base font-bold">100% Pay First</p>
        </div>
      </div>
    </div>
  );
}
