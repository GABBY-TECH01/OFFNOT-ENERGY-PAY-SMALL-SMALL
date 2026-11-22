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
  const { packages, usingDemoCatalog } = useStore();
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
          p.batteryTechnology.toLowerCase().includes(q)
      );

    return [...list].sort((a, b) => {
      if (sortBy === 'price-asc') return a.priceNgn - b.priceNgn;
      if (sortBy === 'price-desc') return b.priceNgn - a.priceNgn;
      return Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
    });
  }, [packages, searchQuery, durationFilter, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="border-b border-slate-200 pb-6 mb-8">
        <p className="text-xs font-bold tracking-wider text-orange-600 uppercase mb-1">
          Complete Solar Systems · Maximum 5-Month Instalment
        </p>
        <h1 className="text-3xl font-extrabold text-slate-900">OFFNOT Solar Packages</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Choose a complete solar energy package, configure your repayment plan (Full Payment or
          2–5 months), and receive professional installation once full payment is completed.
        </p>
      </div>

      {usingDemoCatalog && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900">
          Demonstration package shown: <strong>OFFNOT 4KVA SOLAR PACKAGE (₦2,400,000)</strong>.
          Administrators can add unlimited solar packages, upload images, and edit all prices and
          specifications in the Admin Portal.
        </div>
      )}

      {/* Search, Filter & Sort */}
      <div className="flex flex-col md:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search solar packages by capacity (e.g. 4kVA), battery, or name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          />
        </div>
        <select
          value={durationFilter}
          onChange={(e) => setDurationFilter(Number(e.target.value))}
          className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm bg-white text-slate-800"
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
          className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm bg-white text-slate-800"
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
            initialDepositPercent: pkg.initialDepositPercent,
            adminChargePercent: pkg.adminChargePercent,
          });

          return (
            <div
              key={pkg.id}
              className="group rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              <ProductVisual
                imageUrl={pkg.imageUrl}
                alt={pkg.name}
                category="Solar Package"
                capacityLabel={pkg.capacityKva}
                className="w-full h-56"
              />
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="font-bold text-emerald-700">{pkg.capacityKva} Complete Package</span>
                  <span>Max {maxDuration} Months</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">{pkg.name}</h2>
                <p className="text-xs text-slate-600 line-clamp-2 mb-4">{pkg.description}</p>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-700 space-y-1.5 mb-5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Inverter</span>
                    <span className="font-semibold text-right">{pkg.inverterCapacity}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Battery</span>
                    <span className="font-semibold text-right">{pkg.batteryCapacity}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Solar Panels</span>
                    <span className="font-semibold text-right">
                      {pkg.panelQuantity} × {pkg.panelWattage}
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs text-slate-500">Package Price</span>
                    <span className="text-2xl font-extrabold text-slate-900 font-mono-num">
                      {formatNgn(pkg.priceNgn)}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-orange-700 font-mono-num mb-4">
                    {maxDuration > 1
                      ? `Or ${formatNgn(fiveMonthPlan.monthlyInstalmentNgn)}/mo over ${maxDuration} months`
                      : 'Full Payment Only'}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onSelectPackage(pkg, maxDuration)}
                      className="py-2.5 px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
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
      <div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-emerald-950">
          <p className="font-bold">Strict Pay-Before-Delivery &amp; Installation Policy</p>
          <p className="text-emerald-900/90 mt-0.5">
            Instalment applications are reviewed by management. Delivery, dispatch, and
            installation only take place after 100% full payment has been completed and verified.
          </p>
        </div>
      </div>
    </div>
  );
}
