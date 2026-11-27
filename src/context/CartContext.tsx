import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, Product, SolarPackage } from '../types';
import { getEffectiveProductPrice } from '../utils/instalments';
import { useAuth } from './AuthContext';
import { useStore } from './StoreContext';

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
  reconcileWithCatalog: (products: Product[], packages?: SolarPackage[]) => void;
  packageSelection: PackageCheckoutSelection | null;
  setPackageSelection: (sel: PackageCheckoutSelection | null) => void;
  checkoutMode: 'cart' | 'package';
  setCheckoutMode: (mode: 'cart' | 'package') => void;
}

const CART_STORAGE_KEY = 'offnot_energy_cart_v1';

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isInstaller } = useAuth();
  const { products, packages } = useStore();
  const [rawItems, setRawItems] = useState<CartItem[]>(() => {
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
  const [rawPackageSelection, setRawPackageSelection] = useState<PackageCheckoutSelection | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<'cart' | 'package'>('cart');

  // Hydrate cart items live from StoreContext so admin edits (price, stock, image, name, publish status) propagate immediately
  const items = useMemo<CartItem[]>(() => {
    if (products.length === 0) return rawItems;
    const byId = new Map(products.map((p) => [p.id, p]));
    const resolved: CartItem[] = [];
    for (const entry of rawItems) {
      const live = byId.get(entry.product.id);
      if (!live) continue;
      if (!live.isPublished || live.stock <= 0) continue;
      const qty = Math.min(live.stock, Math.max(1, entry.quantity));
      resolved.push({ product: live, quantity: qty });
    }
    return resolved;
  }, [rawItems, products]);

  // Hydrate selected package live from StoreContext
  const packageSelection = useMemo<PackageCheckoutSelection | null>(() => {
    if (!rawPackageSelection) return null;
    if (packages.length === 0) return rawPackageSelection;
    const livePkg = packages.find((p) => p.id === rawPackageSelection.pkg.id);
    if (!livePkg || !livePkg.isPublished) return null;
    return { ...rawPackageSelection, pkg: livePkg };
  }, [rawPackageSelection, packages]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage write error
    }
  }, [items]);

  const addToCart = (product: Product, quantity = 1, openDrawer = true) => {
    const liveProduct = products.find((p) => p.id === product.id) || product;
    if (liveProduct.stock <= 0) return;
    setRawItems((prev) => {
      const existing = prev.find((i) => i.product.id === liveProduct.id);
      if (existing) {
        const nextQty = Math.min(liveProduct.stock, existing.quantity + quantity);
        return prev.map((i) =>
          i.product.id === liveProduct.id ? { ...i, product: liveProduct, quantity: nextQty } : i
        );
      }
      return [
        ...prev,
        { product: liveProduct, quantity: Math.min(liveProduct.stock, Math.max(1, quantity)) },
      ];
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
    const liveProduct = products.find((p) => p.id === productId);
    setRawItems((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const maxStock = liveProduct ? liveProduct.stock : i.product.stock;
        return {
          product: liveProduct || i.product,
          quantity: Math.min(maxStock, quantity),
        };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setRawItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const clearCart = () => {
    setRawItems([]);
  };

  const reconcileWithCatalog = useCallback(
    (_latestProducts: Product[], _latestPackages?: SolarPackage[]) => {
      // Live synchronization is automatically derived via useMemo against StoreContext
    },
    []
  );

  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotalNgn = items.reduce(
    (acc, i) => acc + getEffectiveProductPrice(i.product, isInstaller) * i.quantity,
    0
  );

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
        reconcileWithCatalog,
        packageSelection,
        setPackageSelection: setRawPackageSelection,
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
