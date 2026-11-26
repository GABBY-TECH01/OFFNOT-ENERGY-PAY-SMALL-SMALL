import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HeadphonesIcon,
  Lock,
  ShieldCheck,
  ShoppingCart,
  Star,
  Users,
  Wrench,
} from 'lucide-react';
import { BranchMap } from '../components/BranchMap';
import { HeroSolarIllustration, ProductVisual } from '../components/ProductVisual';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import type { PageRoute, Product, SolarPackage } from '../types';
import { calculateInstalmentPlan, formatNgn, getEffectiveProductPrice } from '../utils/instalments';

interface HomePageProps {
  onNavigate: (route: PageRoute, section?: string) => void;
  onSelectPackage: (pkg: SolarPackage, duration?: number) => void;
}

const SERVICES_LIST = [
  'Solar system sales and installation',
  'Inverter and battery sales',
  'Solar panel supply',
  'Solar accessories and electrical protection devices',
  'Residential and commercial solar solutions',
  'Solar system maintenance and upgrades',
  'Wholesale and retail distribution',
  'Nationwide delivery and installation support',
  'Technical consultation and customer support',
];

const HOME_FAQS = [
  {
    q: 'How does the OFFNOT ENERGY 5-month solar instalment plan work?',
    a: 'Select any eligible solar package, choose your preferred payment duration (Full Payment, 2, 3, 4, or 5 months maximum), and submit your instalment application for management review. Once approved, you make scheduled monthly payments online or via verified bank transfer.',
  },
  {
    q: 'When will my solar package be delivered and installed?',
    a: 'OFFNOT ENERGY operates a strict PAY FULLY BEFORE DELIVERY AND INSTALLATION policy. Delivery, dispatch, and professional installation are scheduled immediately after 100% of your total package balance is paid and verified.',
  },
  {
    q: 'Can I buy individual inverters, batteries, or panels without an instalment package?',
    a: 'Yes. Visit the Shop page to purchase Hybrid Inverters, Lithium Batteries, Tubular Batteries, Solar Panels, Solar Generators, Portable Power Stations, Solar Cables, Surge Protection Devices, and Accessories via full-payment checkout.',
  },
  {
    q: 'Where are OFFNOT ENERGY offices located?',
    a: 'We operate two branches in Ibadan, Oyo State, Nigeria: Opposite Sweetco, Dugbe Iyaganku Road (07064159047) and Inside Tipper Garage, Dalute Road (08087928125). Customer Service: 07047053453.',
  },
];

export function HomePage({ onNavigate, onSelectPackage }: HomePageProps) {
  const { isInstaller } = useAuth();
  const { packages, products, reviews, usingDemoCatalog } = useStore();
  const { addToCart, setCheckoutMode, setDrawerOpen } = useCart();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const featuredPackages = packages.filter((p) => p.isPublished).slice(0, 3);
  const bestProducts = products.filter((p) => p.isPublished && p.isBestSeller).slice(0, 4);
  const displayProducts =
    bestProducts.length > 0 ? bestProducts : products.filter((p) => p.isPublished).slice(0, 4);

  const handleBuyProductNow = (product: Product) => {
    addToCart(product, 1, false);
    setDrawerOpen(false);
    setCheckoutMode('cart');
    onNavigate('checkout');
  };

  return (
    <div className="bg-white">
      {/* 1. HERO SECTION */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-emerald-50/50 via-white to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-bold tracking-widest text-orange-600 uppercase mb-3">
              OFFNOT ENERGY · CLEAN ENERGY, STRONGER TOMORROW
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.12] mb-5 [text-wrap:balance]">
              POWER YOUR HOME. PAY AT YOUR CONVENIENCE.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed mb-8 max-w-xl">
              Get reliable solar energy solutions from OFFNOT ENERGY. Choose your preferred solar
              package, spread your payments over up to five months, and receive your installation
              after completing payment.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 mb-8">
              <button
                type="button"
                onClick={() => onNavigate('packages')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
              >
                EXPLORE SOLAR PACKAGES
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('shop')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm font-bold hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                SHOP PRODUCTS
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-200 text-xs text-slate-600">
              <div>
                <p className="font-bold text-slate-900 text-sm">Up to 5 Months</p>
                <p>Flexible Instalment Plans</p>
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Ibadan &amp; Nationwide</p>
                <p>Dugbe &amp; Dalute Branches</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="font-bold text-slate-900 text-sm">Pay-Before-Delivery</p>
                <p>Verified Full Release Policy</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroSolarIllustration />
          </div>
        </div>
      </section>

      {/* 2. FEATURED SOLAR PACKAGES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1.5">
              Complete Solar Systems · Up to 5 Months Instalment
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Featured Solar Packages
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('packages')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
          >
            View All Solar Packages
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {usingDemoCatalog && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900">
            Showing demonstration catalog data (including the OFFNOT 4KVA Solar Package template).
            Authorized administrators can edit, replace, or add unlimited packages and products in
            the Admin Portal.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredPackages.map((pkg) => {
            const maxMonths = Math.max(...(pkg.allowedDurations?.length ? pkg.allowedDurations : [5]));
            const calc = calculateInstalmentPlan({
              basePriceNgn: pkg.priceNgn,
              durationMonths: Math.min(5, maxMonths),
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
                  className="w-full h-52"
                />
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                    <span className="font-semibold text-emerald-700">{pkg.capacityKva} System</span>
                    <span>Up to {Math.min(5, maxMonths)} Months</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{pkg.name}</h3>
                  <ul className="text-xs text-slate-600 space-y-1.5 mb-5">
                    <li>· Inverter: {pkg.inverterCapacity}</li>
                    <li>
                      · Battery: {pkg.batteryCapacity} ({pkg.batteryTechnology})
                    </li>
                    <li>
                      · Solar Panels: {pkg.panelQuantity} × {pkg.panelWattage}
                    </li>
                  </ul>

                  <div className="mt-auto pt-4 border-t border-slate-100">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs text-slate-500">Full Package Price</span>
                      <span className="text-xl font-extrabold text-slate-900 font-mono-num">
                        {formatNgn(pkg.priceNgn)}
                      </span>
                    </div>
                    <p className="text-xs text-orange-700 font-semibold mb-4 font-mono-num">
                      From {formatNgn(calc.monthlyInstalmentNgn)}/month ({calc.durationMonths} months)
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectPackage(pkg, 5)}
                        className="py-2.5 px-3 rounded-lg border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectPackage(pkg, 1)}
                        className="py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors cursor-pointer"
                      >
                        Purchase Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. HOW IT WORKS (4 SIMPLE STEPS) */}
      <section className="bg-slate-50 border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-bold tracking-wider text-orange-600 uppercase mb-1.5">
              Transparent Instalment Process
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              How OFFNOT ENERGY Instalments Work
            </h2>
            <p className="text-sm text-slate-600">
              Own a genuine solar power system in four structured steps, with full protection under
              our pay-before-delivery policy.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Choose your preferred solar package',
                desc: 'Browse our complete solar packages, inspect inverter, battery, and panel specs, and select the capacity for your home or business.',
              },
              {
                step: '02',
                title: 'Select your payment duration',
                desc: 'Use our live instalment calculator to pick Full Payment or spread payments over 2, 3, 4, or 5 months maximum.',
              },
              {
                step: '03',
                title: 'Complete your payments over the agreed period',
                desc: 'Once management approves your instalment plan, pay monthly via Paystack, Flutterwave, or verified bank transfer and download receipts.',
              },
              {
                step: '04',
                title: 'Receive your solar system and professional installation after full payment',
                desc: 'When your balance reaches ₦0, your order updates to FULLY PAID – AWAITING DELIVERY and our engineers schedule installation.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl bg-white border border-slate-200 p-6 flex flex-col"
              >
                <span className="text-2xl font-extrabold text-emerald-700 font-mono-num mb-3">
                  {item.step}
                </span>
                <h3 className="text-base font-bold text-slate-900 mb-2 leading-snug">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-emerald-950 text-white p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold">
                  Strict Policy: Pay Fully Before Delivery &amp; Installation
                </p>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  No delivery, dispatch, or installation occurs until 100% of the solar package
                  payment is completed and verified.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('how-it-works')}
              className="px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Read Full Instalment Policy
            </button>
          </div>
        </div>
      </section>

      {/* 4. BEST-SELLING INDIVIDUAL PRODUCTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1.5">
              Individual Solar Hardware · Full-Payment Checkout
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Best-Selling Solar Products
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('shop')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap"
          >
            Browse All 9 Categories
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {displayProducts.map((product) => {
            const displayPrice = getEffectiveProductPrice(product, isInstaller);
            return (
              <div
                key={product.id}
                className="group rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                <ProductVisual
                  imageUrl={product.imageUrl}
                  alt={product.name}
                  category={product.category}
                  className="w-full h-44"
                />
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-xs font-medium text-slate-500 mb-1">{product.category}</p>
                  <h3 className="text-sm font-bold text-slate-900 mb-1 line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono-num mb-3">Model: {product.model}</p>

                  <div className="mt-auto pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-base font-extrabold text-slate-900 font-mono-num">
                          {displayPrice > 0 ? formatNgn(displayPrice) : 'Set Price in Admin'}
                        </span>
                        {isInstaller && product.priceNgn > displayPrice && (
                          <p className="text-[11px] font-semibold text-orange-700">Installer Price</p>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-emerald-700">
                        {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={product.stock <= 0 || displayPrice <= 0}
                        onClick={() => addToCart(product, 1)}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add
                      </button>
                      <button
                        type="button"
                        disabled={product.stock <= 0 || displayPrice <= 0}
                        onClick={() => handleBuyProductNow(product)}
                        className="py-2 px-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. WHY CHOOSE OFFNOT ENERGY & OUR SERVICES */}
      <section className="bg-slate-50 border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-6">
            <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1.5">
              Why Choose OFFNOT ENERGY
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">
              Trusted Commercial Solar Partner in Nigeria
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { Icon: ShieldCheck, title: 'Genuine solar products', desc: 'Verified inverters, lithium & tubular batteries, and Tier-1 PV modules.' },
                { Icon: Wrench, title: 'Professional installation', desc: 'Trained engineers handling safe DC/AC wiring, earthing, and commissioning.' },
                { Icon: Award, title: 'Competitive pricing', desc: 'Direct wholesale and retail pricing from our Dugbe and Dalute branches.' },
                { Icon: HeadphonesIcon, title: 'Reliable after-sales support', desc: 'Dedicated customer service line (07047053453) and maintenance team.' },
                { Icon: Clock, title: 'Flexible instalment options', desc: 'Spread solar package payments cleanly over 2 to 5 months.' },
                { Icon: Users, title: 'Experienced technical team', desc: 'Accurate load sizing and technical consultation before installation.' },
              ].map(({ Icon, title, desc }) => (
                <div key={title} className="rounded-xl bg-white border border-slate-200 p-4">
                  <Icon className="w-5 h-5 text-emerald-700 mb-2" />
                  <h3 className="text-sm font-bold text-slate-900 mb-1">{title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            <p className="text-xs font-bold tracking-wider text-orange-600 uppercase mb-1.5">
              Our Services
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">
              End-to-End Solar Distribution &amp; Engineering
            </h2>
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <ul className="space-y-3">
                {SERVICES_LIST.map((service) => (
                  <li key={service} className="flex items-start gap-3 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>{service}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('services')}
                  className="px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                >
                  Request Technical Consultation
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Visit Ibadan Branches
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. VERIFIED CUSTOMER REVIEWS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1.5">
              Customer Feedback
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Verified Customer Reviews
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('account')}
            className="text-sm font-semibold text-emerald-700 hover:underline cursor-pointer"
          >
            Submit Your Review from My Account
          </button>
        </div>

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm font-semibold text-slate-800 mb-1">
              No published customer reviews yet
            </p>
            <p className="text-xs text-slate-600 max-w-lg mx-auto">
              OFFNOT ENERGY only publishes real, verified customer testimonials submitted by clients
              after purchase and approved by management. Signed-in customers can submit feedback from
              their Customer Dashboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reviews.slice(0, 6).map((rev) => (
              <div key={rev.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-1 text-amber-500 mb-3">
                  {Array.from({ length: Math.min(5, Math.max(1, rev.rating)) }).map((_, idx) => (
                    <Star key={idx} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mb-4">“{rev.quote}”</p>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                  <p className="font-bold text-slate-900">{rev.customerName}</p>
                  <p>
                    {rev.location} · {rev.packageOrProduct}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 7. FAQ & IBADAN BRANCH LOCATOR MAP */}
      <section className="bg-slate-50 border-t border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-14">
          <div>
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-xs font-bold tracking-wider text-orange-600 uppercase mb-1.5">
                  Answers &amp; Policies
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  Frequently Asked Questions
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('policies', 'faq')}
                className="text-sm font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                All Policies &amp; Terms
              </button>
            </div>

            <div className="space-y-3">
              {HOME_FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={faq.q}
                    className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span className="text-sm font-bold text-slate-900">{faq.q}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-6">
              <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1.5">
                Visit Our Offices
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                OFFNOT ENERGY Ibadan Branches
              </h2>
            </div>
            <BranchMap />
          </div>
        </div>
      </section>
    </div>
  );
}
