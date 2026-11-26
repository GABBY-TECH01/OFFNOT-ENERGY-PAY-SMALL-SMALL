import React, { createContext, useContext, useEffect, useState } from 'react';
import type { CartItem, Product, SolarPackage } from '../types';

export interface PackageCheckoutSelection {
  pkg: SolarPackage;
  durationMonths: number;
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotalNgn: number;
  isDrawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  addToCart: (product: Product, quantity?: number, openDrawer?: boolean) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  packageSelection: PackageCheckoutSelection | null;
  setPackageSelection: (sel: PackageCheckoutSelection | null) => void;
  checkoutMode: 'cart' | 'package';
  setCheckoutMode: (mode: 'cart' | 'package') => void;
}

const CART_STORAGE_KEY = 'offnot_energy_cart_v1';

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage read error
    }
    return [];
  });

  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [packageSelection, setPackageSelection] = useState<PackageCheckoutSelection | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<'cart' | 'package'>('cart');

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage write error
    }
  }, [items]);

  const addToCart = (product: Product, quantity = 1, openDrawer = true) => {
    if (product.stock <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((i) => (i.product.id === product.id ? { ...i, product, quantity: nextQty } : i));
      }
      return [...prev, { product, quantity: Math.min(product.stock, Math.max(1, quantity)) }];
    });
    if (openDrawer) {
      setDrawerOpen(true);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, quantity: Math.min(i.product.stock, quantity) } : i
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotalNgn = items.reduce((acc, i) => acc + i.product.priceNgn * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotalNgn,
        isDrawerOpen,
        setDrawerOpen,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        packageSelection,
        setPackageSelection,
        checkoutMode,
        setCheckoutMode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
