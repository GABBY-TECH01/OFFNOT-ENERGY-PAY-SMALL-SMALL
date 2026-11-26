import React from 'react';
import { ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PageRoute } from '../types';

interface FooterProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute, section?: string) => void;
}

export function Footer({ currentRoute, onNavigate }: FooterProps) {
  const { user } = useAuth();
  const showFullFooter = currentRoute === 'home' && !user;
  const copyrightYear = Math.max(2026, new Date().getFullYear());

  const go = (route: PageRoute, section?: string) => {
    onNavigate(route, section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800 no-print">
      {showFullFooter && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand Column */}
          <div>
            <div className="inline-block bg-white rounded-xl p-2.5 mb-4">
              <img
                src="/assets/aistudio/IMG-20261027-WA0006_cf69d348.jpg"
                alt="OFFNOT ENERGY"
                className="h-14 w-auto object-contain"
              />
            </div>
            <p className="text-sm font-semibold text-white mb-1">OFFNOT ENERGY</p>
            <p className="text-xs font-medium text-amber-400 tracking-wide mb-3">
              CLEAN ENERGY, STRONGER TOMORROW.
            </p>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Solar energy, inverter systems, batteries, accessories, wholesale &amp; retail
              distribution, and professional installation across Ibadan, Oyo State, and Nigeria.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a
                href="https://www.facebook.com/offnotenergy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 hover:text-white hover:border-slate-700"
              >
                Facebook: Offnot Energy
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://www.instagram.com/offnot.energy?gwpx=MWVpd2JoYzNkb3hpZA=="
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 hover:text-white hover:border-slate-700"
              >
                Instagram: @offnot.energy
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://www.tiktok.com/@offnot_energy?_r=1&_t=ZS-9Bixi05FnGO"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 hover:text-white hover:border-slate-700"
              >
                TikTok: @offnot_energy
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Navigation Links */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Store &amp; Marketplace</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button type="button" onClick={() => go('packages')} className="hover:text-white cursor-pointer">
                  Solar Packages (Up to 5 Months)
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('shop')} className="hover:text-white cursor-pointer">
                  Shop Individual Solar Products
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('how-it-works')} className="hover:text-white cursor-pointer">
                  How Instalments Work
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('services')} className="hover:text-white cursor-pointer">
                  Our Solar Services
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('account')} className="hover:text-white cursor-pointer">
                  Customer Dashboard &amp; Tracking
                </button>
              </li>
            </ul>
          </div>

          {/* Policies & Support */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Policies &amp; Help</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button type="button" onClick={() => go('policies', 'instalment')} className="hover:text-white cursor-pointer">
                  Instalment Payment Terms
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('policies', 'faq')} className="hover:text-white cursor-pointer">
                  Frequently Asked Questions
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('policies', 'warranty')} className="hover:text-white cursor-pointer">
                  Warranty Policy
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('policies', 'returns')} className="hover:text-white cursor-pointer">
                  Return Policy
                </button>
              </li>
              <li>
                <button type="button" onClick={() => go('policies', 'privacy')} className="hover:text-white cursor-pointer">
                  Privacy Policy &amp; Terms
                </button>
              </li>
            </ul>
          </div>

          {/* Ibadan Branches & Contact */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4">Ibadan Branches &amp; Contact</h3>
            <div className="space-y-3 text-sm text-slate-400">
              <div className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-medium">Customer Service: 07047053453</p>
                  <p className="text-xs">Head Office (Dugbe): 07064159047 · Branch Office (Dalute): 08087928125</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <a href="mailto:offnotenergy@gmail.com" className="hover:text-white">
                  offnotenergy@gmail.com
                </a>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs">
                  <p>
                    <span className="text-white font-semibold">Head Office (Dugbe):</span> Opposite Sweetco,
                    Dugbe Iyaganku Road, Ibadan, Oyo State, Nigeria.
                  </p>
                  <p>
                    <span className="text-white font-semibold">Branch Office (Dalute):</span> Inside Tipper
                    Garage, Dalute Road, Ibadan, Oyo State, Nigeria.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={showFullFooter ? 'border-t border-slate-800/80' : ''}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <p>© {copyrightYear} OFFNOT ENERGY. All rights reserved.</p>
          <p className="text-center sm:text-right">
            Strict Policy: Full payment is required prior to delivery and installation on all instalment orders.
          </p>
        </div>
      </div>
    </footer>
  );
}
