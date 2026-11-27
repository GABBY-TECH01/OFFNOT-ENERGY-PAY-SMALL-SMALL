import React, { useMemo, useState } from 'react';
import { Eye, Search, ShoppingCart, X } from 'lucide-react';
import { ProductVisual } from '../components/ProductVisual';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { PRODUCT_CATEGORIES, type PageRoute, type Product, type ProductCategory } from '../types';
import { formatNgn, getEffectiveProductPrice } from '../utils/instalments';

interface ShopPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function ShopPage({ onNavigate }: ShopPageProps) {
  const { isInstaller } = useAuth();
  const { products } = useStore();
  const { addToCart, setCheckoutMode, setDrawerOpen } = useCart();

  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured');
  const [detailProductId, setDetailProductId] = useState<string | null>(null);

  const detailProduct = useMemo(
    () => products.find((p) => p.id === detailProductId) || null,
    [products, detailProductId]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products
      .filter((p) => p.isPublished)
      .filter((p) => selectedCategory === 'ALL' || p.category === selectedCategory)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.specs.toLowerCase().includes(q)
      );

    return [...list].sort((a, b) => {
      const priceA = getEffectiveProductPrice(a, isInstaller);
      const priceB = getEffectiveProductPrice(b, isInstaller);
      if (sortBy === 'price-asc') return priceA - priceB;
      if (sortBy === 'price-desc') return priceB - priceA;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller));
    });
  }, [products, selectedCategory, searchQuery, sortBy, isInstaller]);

  const handleBuyNow = (product: Product) => {
    addToCart(product, 1, false);
    setDrawerOpen(false);
    setCheckoutMode('cart');
    onNavigate('checkout');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-emerald-700 dark:text-emerald-400 uppercase mb-1">
            Individual Solar Store · Full-Payment Checkout
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">Shop Solar Components</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
            Buy individual inverters, lithium &amp; tubular batteries, solar panels, portable power
            stations, cables, surge protection devices, flood lights, and solar cameras.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('packages')}
          className="px-4 py-2.5 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
        >
          Looking for Instalments? View Solar Packages
        </button>
      </div>

      {/* Search & Sort Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name, model, or specification..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700"
        >
          <option value="featured">Sort: Best Sellers</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            selectedCategory === 'ALL'
              ? 'bg-emerald-700 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          All Categories ({products.filter((p) => p.isPublished).length})
        </button>
        {PRODUCT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedCategory === cat
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <p className="text-base font-bold text-slate-900 dark:text-white mb-1">No matching products found</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Try clearing your search or choosing another category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => {
            const displayPrice = getEffectiveProductPrice(product, isInstaller);
            return (
              <div
                key={product.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                <ProductVisual
                  imageUrl={product.imageUrl}
                  alt={product.name}
                  category={product.category}
                  className="w-full h-52"
                />
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>{product.category}</span>
                    <span className={product.stock > 0 ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                      {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">{product.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num mb-2">Model: {product.model}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mb-4">{product.specs}</p>

                  <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-baseline justify-between mb-3 gap-2">
                      <div>
                        <span className="text-lg font-extrabold text-slate-900 dark:text-white font-mono-num">
                          {displayPrice > 0 ? formatNgn(displayPrice) : 'Configure Price in Admin'}
                        </span>
                        {isInstaller && (
                          <div className="text-[11px] font-semibold text-orange-700 dark:text-orange-400 mt-0.5">
                            Installer/Dealer Price
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailProductId(product.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Specs
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={product.stock <= 0 || displayPrice <= 0}
                        onClick={() => addToCart(product, 1)}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add to Cart
                      </button>
                      <button
                        type="button"
                        disabled={product.stock <= 0 || displayPrice <= 0}
                        onClick={() => handleBuyNow(product)}
                        className="py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
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
      )}

      {/* Product Detail Modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white pr-2">{detailProduct.name}</h3>
              <button
                type="button"
                onClick={() => setDetailProductId(null)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 overflow-y-auto">
              <div className="sm:col-span-5">
                <ProductVisual
                  imageUrl={detailProduct.imageUrl}
                  alt={detailProduct.name}
                  category={detailProduct.category}
                  className="w-full h-full min-h-[220px]"
                />
              </div>
              <div className="sm:col-span-7 p-6 space-y-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {detailProduct.category} · Model {detailProduct.model}
                </div>
                {(() => {
                  const modalPrice = getEffectiveProductPrice(detailProduct, isInstaller);
                  return (
                    <div>
                      <p className="text-2xl font-extrabold text-emerald-800 dark:text-emerald-400 font-mono-num">
                        {modalPrice > 0 ? formatNgn(modalPrice) : 'Configure Price in Admin'}
                      </p>
                      {isInstaller && (
                        <p className="text-xs text-orange-700 dark:text-orange-400 font-semibold mt-0.5">
                          Installer/Dealer Price
                        </p>
                      )}
                    </div>
                  );
                })()}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase mb-1">Description</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {detailProduct.description}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase mb-1">
                    Technical Specifications
                  </h4>
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{detailProduct.specs}</p>
                </div>
                {detailProduct.warranty && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Warranty: {detailProduct.warranty}</p>
                )}
                <div className="pt-2 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={
                      detailProduct.stock <= 0 ||
                      getEffectiveProductPrice(detailProduct, isInstaller) <= 0
                    }
                    onClick={() => {
                      addToCart(detailProduct, 1);
                      setDetailProductId(null);
                    }}
                    className="flex-1 py-2.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    disabled={
                      detailProduct.stock <= 0 ||
                      getEffectiveProductPrice(detailProduct, isInstaller) <= 0
                    }
                    onClick={() => {
                      const prod = detailProduct;
                      setDetailProductId(null);
                      handleBuyNow(prod);
                    }}
                    className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                  >
                    Buy Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailProductId(null)}
                    className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
