import React, { useMemo, useState } from 'react';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import { ProductVisual } from '../components/ProductVisual';
import { useStore } from '../context/StoreContext';
import type { SolarPackage } from '../types';
import { calculateInstalmentPlan, formatNgn } from '../utils/instalments';

interface PackagesPageProps {
  onSelectPackage: (pkg: SolarPackage, duration?: number) => void;
}

export function PackagesPage({ onSelectPackage }: PackagesPageProps) {
  const { packages } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [durationFilter, setDurationFilter] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = packages
      .filter((p) => p.isPublished)
      .filter((p) => {
        if (durationFilter > 0) {
          return (p.allowedDurations || [1, 2, 3, 4, 5]).includes(durationFilter);
        }
        return true;
      })
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.capacityKva.toLowerCase().includes(q) ||
          p.inverterCapacity.toLowerCase().includes(q) ||
          p.batteryTechnology.toLowerCase().includes(q) ||
          (p.loadCapacity && p.loadCapacity.toLowerCase().includes(q))
      );

    return [...list].sort((a, b) => {
      if (sortBy === 'price-asc') return a.priceNgn - b.priceNgn;
      if (sortBy === 'price-desc') return b.priceNgn - a.priceNgn;
      const featDiff = Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
      return featDiff !== 0 ? featDiff : a.priceNgn - b.priceNgn;
    });
  }, [packages, searchQuery, durationFilter, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
        <p className="text-xs font-bold tracking-wider text-orange-600 dark:text-orange-400 uppercase mb-1">
          Complete Solar Systems · Maximum 5-Month Instalment
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">OFFNOT Solar Packages</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
          Pay the exact listed amount in full, or spread payments over 2–5 months with a small
          package instalment fee. Check what each system can carry before you order.
        </p>
      </div>

      {/* Search, Filter & Sort */}
      <div className="flex flex-col md:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by capacity (e.g. 4kVA), appliances it carries, or battery..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          />
        </div>
        <select
          value={durationFilter}
          onChange={(e) => setDurationFilter(Number(e.target.value))}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        >
          <option value={0}>All Payment Durations</option>
          <option value={1}>Supports Full Payment</option>
          <option value={2}>Supports 2 Months</option>
          <option value={3}>Supports 3 Months</option>
          <option value={4}>Supports 4 Months</option>
          <option value={5}>Supports 5 Months</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        >
          <option value="featured">Sort: Featured</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((pkg) => {
          const durations = (pkg.allowedDurations?.length ? pkg.allowedDurations : [1, 2, 3, 4, 5]).filter(
            (d) => d >= 1 && d <= 5
          );
          const maxDuration = Math.max(...durations);
          const fiveMonthPlan = calculateInstalmentPlan({
            basePriceNgn: pkg.priceNgn,
            durationMonths: maxDuration,
            instalmentSurchargeNgn: pkg.instalmentSurchargeNgn,
            initialDepositPercent: pkg.initialDepositPercent,
            adminChargePercent: pkg.adminChargePercent,
          });

          return (
            <div
              key={pkg.id}
              className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              <ProductVisual
                imageUrl={pkg.imageUrl}
                alt={pkg.name}
                category="Solar Package"
                capacityLabel={pkg.capacityKva}
                className="w-full h-56"
              />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{pkg.capacityKva} Complete Package</span>
                  <span>Max {maxDuration} Months</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{pkg.name}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mb-4">{pkg.description}</p>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-3.5 text-xs text-slate-700 dark:text-slate-200 space-y-1.5 mb-3">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Inverter</span>
                    <span className="font-semibold text-right">{pkg.inverterCapacity}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Battery</span>
                    <span className="font-semibold text-right">{pkg.batteryCapacity}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Solar Panels</span>
                    <span className="font-semibold text-right">
                      {pkg.panelQuantity} × {pkg.panelWattage}
                    </span>
                  </div>
                </div>

                {pkg.loadCapacity && (
                  <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-900 p-3 text-xs text-emerald-950 dark:text-emerald-200 mb-5">
                    <p className="font-bold text-[11px] uppercase tracking-wide text-emerald-800 dark:text-emerald-300 mb-0.5">
                      What This System Can Carry
                    </p>
                    <p className="leading-relaxed">{pkg.loadCapacity}</p>
                  </div>
                )}

                <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Full Payment Price</span>
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono-num">
                      {formatNgn(pkg.priceNgn)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 font-mono-num mb-4">
                    {maxDuration > 1
                      ? `Instalment: ${formatNgn(fiveMonthPlan.monthlyInstalmentNgn)}/mo × ${maxDuration} mos (Total ${formatNgn(fiveMonthPlan.totalPayableNgn)})`
                      : 'Full Payment Only'}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSelectPackage(pkg, maxDuration)}
                      className="py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectPackage(pkg, 1)}
                      className="inline-flex items-center justify-center gap-1 py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                    >
                      Purchase Now
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strict Policy Footer Callout */}
      <div className="mt-10 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40 p-5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-emerald-950 dark:text-emerald-100">
          <p className="font-bold">Strict Pay-Before-Delivery &amp; Installation Policy</p>
          <p className="text-emerald-900/90 dark:text-emerald-200/80 mt-0.5">
            Instalment applications are reviewed by management. Delivery, dispatch, and
            installation only take place after 100% full payment has been completed and verified.
          </p>
        </div>
      </div>
    </div>
  );
}
