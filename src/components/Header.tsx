import React, { useState } from 'react';
import {
  Menu,
  MessageCircle,
  Shield,
  ShoppingCart,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { PageRoute } from '../types';
import { buildWhatsAppLink } from '../utils/instalments';

interface HeaderProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
}

const NAV_ITEMS: { label: string; route: PageRoute }[] = [
  { label: 'Home', route: 'home' },
  { label: 'Shop', route: 'shop' },
  { label: 'Solar Packages', route: 'packages' },
  { label: 'How It Works', route: 'how-it-works' },
  { label: 'Our Services', route: 'services' },
  { label: 'About Us', route: 'about' },
  { label: 'Contact Us', route: 'contact' },
];

export function Header({ currentRoute, onNavigate }: HeaderProps) {
  const { user, isStaff } = useAuth();
  const { itemCount, setDrawerOpen } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (route: PageRoute) => {
    onNavigate(route);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
        {/* Brand Logo (Official uploaded asset, never distorted or recolored) */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-lg"
          aria-label="OFFNOT ENERGY Home"
        >
          <img
            src="/assets/aistudio/IMG-20261027-WA0006_cf69d348.jpg"
            alt="OFFNOT ENERGY Logo"
            className="h-12 w-auto object-contain"
          />
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden xl:flex items-center gap-5 text-sm font-medium text-slate-700">
          {NAV_ITEMS.map((item) => {
            const active =
              currentRoute === item.route ||
              (item.route === 'packages' && currentRoute === 'package-detail');
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-emerald-700 text-emerald-800 font-semibold'
                    : 'border-transparent hover:text-emerald-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => handleNav('account')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              currentRoute === 'account'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent hover:text-emerald-700'
            }`}
          >
            My Account
          </button>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <a
            href={buildWhatsAppLink(
              'Hello OFFNOT ENERGY, I would like assistance with solar products and instalment packages.'
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp Support
          </a>

          {isStaff && (
            <button
              type="button"
              onClick={() => handleNav('admin')}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentRoute === 'admin'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-orange-600" />
              Admin Portal
            </button>
          )}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative p-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            aria-label="Open Shopping Cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-orange-600 text-white text-[11px] font-bold flex items-center justify-center font-mono-num">
                {itemCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleNav(user ? (isStaff ? 'admin' : 'account') : 'auth')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <User className="w-4 h-4" />
            <span>{user ? (isStaff ? 'Staff Portal' : 'Dashboard') : 'Login'}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="xl:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="xl:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                currentRoute === item.route
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleNav('account')}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            My Account
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => handleNav('admin')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-orange-700 bg-orange-50 cursor-pointer"
            >
              Staff Admin Portal
            </button>
          )}
          <div className="pt-2 border-t border-slate-100">
            <a
              href={buildWhatsAppLink(
                'Hello OFFNOT ENERGY, I need support with a solar order or package.'
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold"
            >
              <MessageCircle className="w-4 h-4" />
              Chat on WhatsApp (07047053453)
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
