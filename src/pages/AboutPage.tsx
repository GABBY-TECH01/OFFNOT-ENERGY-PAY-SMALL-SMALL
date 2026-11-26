import React from 'react';
import { ArrowRight, CheckCircle2, MapPin } from 'lucide-react';
import { BranchMap } from '../components/BranchMap';
import type { PageRoute } from '../types';

interface AboutPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function AboutPage({ onNavigate }: AboutPageProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-4">
          <p className="text-xs font-bold tracking-wider text-orange-600 uppercase">
            About OFFNOT ENERGY
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
            CLEAN ENERGY, STRONGER TOMORROW.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Headquartered in Ibadan, Oyo State, Nigeria, OFFNOT ENERGY is a commercial renewable
            energy company dedicated to solar system sales, inverter and battery distribution,
            solar accessories, electrical protection devices, and certified installation across
            Nigeria.
          </p>
          <p className="text-base text-slate-600 leading-relaxed">
            To help families and businesses transition away from noisy, high-cost fuel generators,
            OFFNOT ENERGY operates a structured instalment purchase program allowing customers to
            spread complete solar package payments over up to five months, with guaranteed
            professional installation upon full payment.
          </p>
          <div className="pt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
            >
              Explore Solar Packages
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="px-5 py-3 rounded-lg border border-slate-300 text-slate-800 text-sm font-bold hover:bg-slate-50 cursor-pointer"
            >
              Contact Our Branches
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center text-center">
          <img
            src="/assets/aistudio/IMG-20261027-WA0006_cf69d348.jpg"
            alt="OFFNOT ENERGY Official Logo"
            className="h-36 w-auto object-contain mb-4"
          />
          <p className="text-sm font-bold text-slate-900">OFFNOT ENERGY</p>
          <p className="text-xs text-slate-500 mt-1">
            Ibadan, Oyo State, Nigeria · Wholesale, Retail &amp; Installation
          </p>
        </div>
      </div>

      {/* Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            title: 'Genuine Equipment Only',
            desc: 'Every inverter, lithium battery, tubular battery, solar panel, and surge protection device is verified for Nigerian grid and tropical conditions.',
          },
          {
            title: 'Structured 5-Month Instalments',
            desc: 'Customers pay conveniently over 2 to 5 months with transparent pricing, official digital receipts, and clear milestone tracking.',
          },
          {
            title: 'Head Office & Branch Office in Ibadan',
            desc: 'Visit our Head Office opposite Sweetco, Dugbe Iyaganku Road or our Branch Office inside Tipper Garage, Dalute Road for live product inspection, wholesale pickup, and technical advice.',
          },
        ].map((card) => (
          <div key={card.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 mb-3" />
            <h2 className="text-base font-bold text-slate-900 mb-2">{card.title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{card.desc}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-emerald-700" />
          <h2 className="text-2xl font-bold text-slate-900">Our Ibadan Branch Network</h2>
        </div>
        <BranchMap />
      </div>
    </div>
  );
}
