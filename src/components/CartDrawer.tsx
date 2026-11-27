import React from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { PageRoute } from '../types';
import { formatNgn, getEffectiveProductPrice } from '../utils/instalments';
import { ProductVisual } from './ProductVisual';

interface CartDrawerProps {
  onNavigate: (route: PageRoute) => void;
}

export function CartDrawer({ onNavigate }: CartDrawerProps) {
  const { isInstaller } = useAuth();
  const {
    items,
    subtotalNgn,
    isDrawerOpen,
    setDrawerOpen,
    updateQuantity,
    removeFromCart,
    setCheckoutMode,
  } = useCart();

  if (!isDrawerOpen) return null;

  const proceedToCheckout = () => {
    setCheckoutMode('cart');
    setDrawerOpen(false);
    onNavigate('checkout');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full max-h-dvh flex flex-col shadow-2xl border-l border-transparent dark:border-slate-800">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your Shopping Cart</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isInstaller
                ? 'Installer/Dealer Account · Full Payment Checkout'
                : 'Individual Solar Products · Full Payment Checkout'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close Cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-4">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Your cart is empty</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                Browse individual inverters, lithium batteries, solar panels, and accessories—or
                choose a complete solar package with up to 5-month instalments.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onNavigate('shop');
                  }}
                  className="w-full py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 cursor-pointer"
                >
                  Shop Individual Products
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    onNavigate('packages');
                  }}
                  className="w-full py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Explore Solar Packages
                </button>
              </div>
            </div>
          ) : (
            items.map(({ product, quantity }) => {
              const unitPrice = getEffectiveProductPrice(product, isInstaller);
              return (
                <div
                  key={product.id}
                  className="flex gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60"
                >
                  <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-slate-100 dark:border-slate-800">
                    <ProductVisual
                      imageUrl={product.imageUrl}
                      alt={product.name}
                      category={product.category}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{product.category}</p>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{product.name}</h3>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400 font-mono-num mt-0.5">
                      {formatNgn(unitPrice)}
                    </p>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="inline-flex items-center border border-slate-200 dark:border-slate-700 rounded-lg">
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-semibold font-mono-num text-slate-900 dark:text-slate-100">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(product.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Products Subtotal</span>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono-num">
                {formatNgn(subtotalNgn)}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Delivery &amp; optional installation charges are calculated at checkout based on your
              location.
            </p>
            <button
              type="button"
              onClick={proceedToCheckout}
              className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              Proceed to Product Checkout
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
