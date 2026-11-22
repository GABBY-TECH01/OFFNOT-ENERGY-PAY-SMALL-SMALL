import React, { useState } from 'react';
import { ArrowRight, Calculator, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { PageRoute } from '../types';
import { calculateInstalmentPlan, formatNgn } from '../utils/instalments';

interface HowItWorksPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function HowItWorksPage({ onNavigate }: HowItWorksPageProps) {
  const { packages, storeSettings } = useStore();
  const samplePkg = packages[0];
  const [selectedPkgId, setSelectedPkgId] = useState<string>(samplePkg?.id || '');
  const [months, setMonths] = useState<number>(5);

  const activePkg = packages.find((p) => p.id === selectedPkgId) || samplePkg;
  const calc = activePkg
    ? calculateInstalmentPlan({
        basePriceNgn: activePkg.priceNgn,
        durationMonths: months,
        initialDepositPercent: activePkg.initialDepositPercent ?? storeSettings.defaultInitialDepositPercent,
        adminChargePercent: activePkg.adminChargePercent ?? storeSettings.defaultAdminChargePercent,
      })
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-14">
      <div className="max-w-3xl">
        <p className="text-xs font-bold tracking-wider text-orange-600 uppercase mb-2">
          OFFNOT ENERGY Instalment System
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-4">
          How Our 5-Month Solar Instalment Plan Works
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          OFFNOT ENERGY makes reliable solar systems accessible without hidden surprises. Spread
          your solar package payment over up to five months, track every receipt in your dashboard,
          and receive professional installation once full payment is completed.
        </p>
      </div>

      {/* 4 Simple Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            num: '01',
            title: 'Choose your preferred solar package',
            body: 'Select from our dynamic catalog of complete solar systems tailored for homes, offices, and commercial sites.',
          },
          {
            num: '02',
            title: 'Select your payment duration',
            body: 'Pick Full Payment or split across 2, 3, 4, or 5 months maximum. See your exact monthly obligation immediately.',
          },
          {
            num: '03',
            title: 'Complete your payments over the agreed period',
            body: 'Once management approves your application, pay each instalment via Paystack, Flutterwave, or verified bank transfer.',
          },
          {
            num: '04',
            title: 'Receive your solar system and professional installation after full payment',
            body: 'When your outstanding balance reaches ₦0, your order status switches to FULLY PAID – AWAITING DELIVERY for installation scheduling.',
          },
        ].map((step) => (
          <div key={step.num} className="rounded-2xl border border-slate-200 bg-white p-6">
            <span className="text-2xl font-extrabold text-emerald-700 font-mono-num block mb-3">
              {step.num}
            </span>
            <h2 className="text-base font-bold text-slate-900 mb-2">{step.title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>

      {/* Interactive Calculator Preview */}
      {activePkg && calc && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-6 space-y-5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
              <Calculator className="w-4 h-4" />
              Interactive Instalment Preview
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Calculate Your Monthly Instalment
            </h2>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Choose Solar Package
              </label>
              <select
                value={activePkg.id}
                onChange={(e) => setSelectedPkgId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900"
              >
                {packages.filter((p) => p.isPublished).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatNgn(p.priceNgn)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Repayment Period (Maximum 5 Months)
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonths(m)}
                    className={`py-2.5 px-2 rounded-lg border text-xs font-bold cursor-pointer ${
                      months === m
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {m === 1 ? 'Full Pay' : `${m} Months`}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Package Price</span>
                <span className="font-bold font-mono-num">{formatNgn(calc.basePriceNgn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Selected Plan</span>
                <span className="font-semibold">
                  {months === 1 ? 'Full Payment' : `${months} Months`}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="font-bold text-slate-900">
                  {months === 1 ? 'Total Payment' : 'Monthly Payment'}
                </span>
                <span className="text-xl font-extrabold text-emerald-800 font-mono-num">
                  {formatNgn(months === 1 ? calc.totalPayableNgn : calc.monthlyInstalmentNgn)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
            >
              Browse &amp; Apply for Solar Packages
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Schedule Breakdown ({activePkg.name})
            </h3>
            <div className="divide-y divide-slate-100 text-sm">
              {calc.schedule.map((row) => (
                <div key={row.instalmentNumber} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{row.label}</p>
                    <p className="text-xs text-slate-500 font-mono-num">Due: {row.dueDate}</p>
                  </div>
                  <span className="font-bold font-mono-num text-emerald-800">
                    {formatNgn(row.amountNgn)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Strict Policy Banner */}
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2.5 text-orange-950">
          <Lock className="w-6 h-6 text-orange-700" />
          <h2 className="text-xl font-extrabold">
            Strict Policy: PAY FULLY BEFORE DELIVERY AND INSTALLATION
          </h2>
        </div>
        <p className="text-sm text-orange-950/90 leading-relaxed max-w-4xl">
          To keep our instalment plans fair and accessible without excessive collateral barriers,
          OFFNOT ENERGY strictly enforces a Pay Fully Before Delivery and Installation policy on all
          instalment purchases.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {[
            'No delivery or dispatch before 100% payment completion.',
            'No engineering installation before 100% payment verification.',
            'No staff or customer bypass without authorised Super Admin audit override.',
          ].map((rule) => (
            <div key={rule} className="rounded-xl bg-white border border-orange-200 p-4 flex items-start gap-2.5 text-xs font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>{rule}</span>
            </div>
          ))}
        </div>
        <div className="pt-2 flex items-center gap-2 text-xs text-orange-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            As soon as your final payment clears, your order automatically becomes{' '}
            <strong>FULLY PAID – AWAITING DELIVERY</strong> and our team schedules dispatch and
            installation.
          </span>
        </div>
      </div>
    </div>
  );
}
