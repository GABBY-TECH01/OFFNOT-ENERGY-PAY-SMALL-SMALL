import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import { ProductVisual } from '../components/ProductVisual';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import type { PageRoute, SolarPackage } from '../types';
import { calculateInstalmentPlan, formatNgn } from '../utils/instalments';

interface PackageDetailPageProps {
  pkg: SolarPackage;
  initialDuration?: number;
  onNavigate: (route: PageRoute) => void;
}

export function PackageDetailPage({
  pkg,
  initialDuration = 5,
  onNavigate,
}: PackageDetailPageProps) {
  const { storeSettings } = useStore();
  const { setPackageSelection, setCheckoutMode } = useCart();

  const allowedDurations = useMemo(() => {
    const raw = pkg.allowedDurations?.length
      ? pkg.allowedDurations
      : storeSettings.allowedDurations || [1, 2, 3, 4, 5];
    const clean = raw.filter((d) => d >= 1 && d <= 5);
    return clean.length > 0 ? clean.sort((a, b) => a - b) : [1, 2, 3, 4, 5];
  }, [pkg.allowedDurations, storeSettings.allowedDurations]);

  const [selectedDuration, setSelectedDuration] = useState<number>(
    allowedDurations.includes(initialDuration) ? initialDuration : allowedDurations[0]
  );

  useEffect(() => {
    setSelectedDuration(
      allowedDurations.includes(initialDuration) ? initialDuration : allowedDurations[0]
    );
  }, [pkg.id, initialDuration, allowedDurations]);

  const depositPct = pkg.initialDepositPercent ?? storeSettings.defaultInitialDepositPercent ?? 0;
  const adminChargePct = pkg.adminChargePercent ?? storeSettings.defaultAdminChargePercent ?? 0;

  const calculation = useMemo(
    () =>
      calculateInstalmentPlan({
        basePriceNgn: pkg.priceNgn,
        durationMonths: selectedDuration,
        initialDepositPercent: depositPct,
        adminChargePercent: adminChargePct,
      }),
    [pkg.priceNgn, selectedDuration, depositPct, adminChargePct]
  );

  const comparisonRows = useMemo(
    () =>
      [1, 2, 3, 4, 5]
        .filter((d) => allowedDurations.includes(d))
        .map((d) =>
          calculateInstalmentPlan({
            basePriceNgn: pkg.priceNgn,
            durationMonths: d,
            initialDepositPercent: depositPct,
            adminChargePercent: adminChargePct,
          })
        ),
    [allowedDurations, pkg.priceNgn, depositPct, adminChargePct]
  );

  const handleProceed = () => {
    setPackageSelection({
      pkg,
      durationMonths: selectedDuration,
    });
    setCheckoutMode('package');
    onNavigate('checkout');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <button
        type="button"
        onClick={() => onNavigate('packages')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-700 mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Solar Packages
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Visual & Full Technical Specifications */}
        <div className="lg:col-span-7 space-y-8">
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <ProductVisual
              imageUrl={pkg.imageUrl}
              alt={pkg.name}
              category="Solar Package"
              capacityLabel={pkg.capacityKva}
              className="w-full h-72 sm:h-96"
            />
          </div>

          <div>
            <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1">
              {pkg.capacityKva} Complete Solar System
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-3">{pkg.name}</h1>
            <p className="text-base text-slate-600 leading-relaxed">{pkg.description}</p>
          </div>

          {/* Detailed Specifications Grid */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">System Specifications</h2>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              {[
                { label: 'System Capacity', value: pkg.capacityKva },
                { label: 'Inverter Capacity', value: pkg.inverterCapacity },
                { label: 'Battery Capacity', value: pkg.batteryCapacity },
                { label: 'Battery Technology', value: pkg.batteryTechnology },
                { label: 'Solar Panel Quantity', value: `${pkg.panelQuantity} Units` },
                { label: 'Solar Panel Wattage', value: pkg.panelWattage },
                { label: 'Accessories Included', value: pkg.accessoriesIncluded },
                { label: 'Installation Details', value: pkg.installationDetails },
                { label: 'Warranty Information', value: pkg.warrantyInfo },
              ].map((row) => (
                <div
                  key={row.label}
                  className="px-6 py-3.5 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-4"
                >
                  <span className="sm:col-span-4 font-semibold text-slate-600">{row.label}</span>
                  <span className="sm:col-span-8 text-slate-900">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* All Duration Comparison Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Instalment Plan Comparison (Max 5 Months)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Payment Option</th>
                    <th className="px-6 py-3 font-semibold">Total Payable</th>
                    <th className="px-6 py-3 font-semibold">Monthly Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {comparisonRows.map((row) => (
                    <tr
                      key={row.durationMonths}
                      onClick={() => setSelectedDuration(row.durationMonths)}
                      className={`cursor-pointer transition-colors ${
                        selectedDuration === row.durationMonths
                          ? 'bg-emerald-50/70 font-semibold'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-6 py-3 text-slate-900">
                        {row.durationMonths === 1
                          ? 'Full Payment'
                          : `${row.durationMonths} Months`}
                      </td>
                      <td className="px-6 py-3 font-mono-num text-slate-700">
                        {formatNgn(row.totalPayableNgn)}
                      </td>
                      <td className="px-6 py-3 font-mono-num text-emerald-800 font-bold">
                        {row.durationMonths === 1
                          ? formatNgn(row.totalPayableNgn)
                          : `${formatNgn(row.monthlyInstalmentNgn)}/mo`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Interactive Instalment Calculator & Purchase Module */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-500">Package Base Price</p>
              <p className="text-3xl font-extrabold text-slate-900 font-mono-num">
                {formatNgn(pkg.priceNgn)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Select Payment Duration (Max 5 Months)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allowedDurations.map((months) => {
                  const active = selectedDuration === months;
                  return (
                    <button
                      key={months}
                      type="button"
                      onClick={() => setSelectedDuration(months)}
                      className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {months === 1 ? 'Full Payment' : `${months} Months`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Calculation Summary */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Package Price</span>
                <span className="font-bold font-mono-num text-slate-900">
                  {formatNgn(calculation.basePriceNgn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Selected Duration</span>
                <span className="font-semibold text-slate-900">
                  {selectedDuration === 1 ? 'Full Payment (100%)' : `${selectedDuration} Months`}
                </span>
              </div>
              {calculation.adminChargeNgn > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Admin Charge ({calculation.adminChargePercent}%)
                  </span>
                  <span className="font-semibold font-mono-num text-slate-900">
                    {formatNgn(calculation.adminChargeNgn)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-700 font-semibold">
                  {selectedDuration === 1 ? 'Amount Due Now' : 'Monthly Instalment'}
                </span>
                <span className="text-lg font-extrabold font-mono-num text-emerald-800">
                  {formatNgn(
                    selectedDuration === 1
                      ? calculation.totalPayableNgn
                      : calculation.monthlyInstalmentNgn
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Amount Already Paid</span>
                <span className="font-mono-num">₦0</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Total Outstanding Upon Order</span>
                <span className="font-mono-num font-semibold text-orange-700">
                  {formatNgn(calculation.totalPayableNgn)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>First Payment Date</span>
                <span className="font-mono-num">{calculation.nextPaymentDueDate}</span>
              </div>
            </div>

            {/* Payment Schedule Preview */}
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                Full Payment Schedule
              </h3>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {calculation.schedule.map((item) => (
                  <div
                    key={item.instalmentNumber}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{item.label}</p>
                      <p className="text-slate-500 font-mono-num">Due: {item.dueDate}</p>
                    </div>
                    <span className="font-bold font-mono-num text-slate-900">
                      {formatNgn(item.amountNgn)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Strict Delivery Policy Notice */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-xs text-orange-950 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <Lock className="w-4 h-4 text-orange-700" />
                PAY FULLY BEFORE DELIVERY AND INSTALLATION
              </div>
              <p className="leading-relaxed">
                {selectedDuration > 1
                  ? 'Instalment applications are subject to management approval. Delivery, dispatch, and professional installation are strictly withheld until 100% of all instalments are completed.'
                  : 'Full payment unlocks immediate scheduling for delivery and professional installation.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleProceed}
              className="w-full py-3.5 px-5 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {selectedDuration === 1
                ? 'Proceed to Full-Payment Checkout'
                : `Apply for ${selectedDuration}-Month Instalment Plan`}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-2 text-xs text-slate-500">
              {selectedDuration > 1 ? (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Management approval required before first instalment collection.</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>100% full payment qualifies immediately for delivery scheduling.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
