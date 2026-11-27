import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { PageRoute } from '../types';

interface BannerSlideshowProps {
  currentRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
}

const TARGET_ROUTES: PageRoute[] = ['home', 'shop', 'packages', 'contact', 'account'];

const THEME_STYLES: Record<string, string> = {
  emerald:
    'bg-gradient-to-r from-emerald-950 via-emerald-800 to-slate-900 text-white border-emerald-700/60',
  slate:
    'bg-gradient-to-r from-slate-950 via-slate-800 to-emerald-900 text-white border-slate-700/60',
  orange:
    'bg-gradient-to-r from-slate-950 via-orange-700 to-amber-600 text-white border-orange-500/60',
  teal:
    'bg-gradient-to-r from-teal-950 via-emerald-800 to-cyan-900 text-white border-teal-700/60',
};

export function BannerSlideshow({ currentRoute, onNavigate }: BannerSlideshowProps) {
  const { activeBanners } = useStore();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const visible = TARGET_ROUTES.includes(currentRoute) && activeBanners.length > 0;
  const safeIndex = activeBanners.length > 0 ? index % activeBanners.length : 0;

  useEffect(() => {
    if (!visible || activeBanners.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % activeBanners.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [visible, activeBanners.length, paused]);

  if (!visible) return null;

  const activeSlide = activeBanners[safeIndex] || activeBanners[0];
  const gradientClass =
    THEME_STYLES[activeSlide.themeVariant || 'emerald'] || THEME_STYLES.emerald;

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length);
  };

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((prev) => (prev + 1) % activeBanners.length);
  };

  return (
    <section
      aria-label="OFFNOT ENERGY Promotional Banner Slideshow"
      className="w-full bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-[1285px] mx-auto px-2 sm:px-4 py-1.5 sm:py-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onNavigate(activeSlide.ctaRoute)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate(activeSlide.ctaRoute);
            }
          }}
          className={`relative w-full min-h-[54px] sm:h-[63px] rounded-xl border overflow-hidden shadow-xs cursor-pointer transition-all ${gradientClass}`}
        >
          {activeSlide.imageUrl ? (
            <>
              <img
                src={activeSlide.imageUrl}
                alt={activeSlide.title}
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/55 to-slate-950/75" />
            </>
          ) : null}

          <div className="relative z-10 h-full px-2.5 sm:px-4 py-1.5 sm:py-0 flex items-center justify-between gap-2 sm:gap-4">
            {activeBanners.length > 1 && (
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous Banner Slide"
                className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/25 hover:bg-black/45 text-white shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-extrabold tracking-wide uppercase truncate">
                    {activeSlide.title}
                  </p>
                  {activeSlide.subtitle && (
                    <p className="text-[10px] sm:text-[11px] text-white/85 truncate hidden xs:block sm:block">
                      {activeSlide.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {activeBanners.length > 1 && (
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {activeBanners.map((slide, idx) => (
                      <button
                        key={slide.id}
                        type="button"
                        aria-label={`Banner slide ${idx + 1}`}
                        onClick={() => setIndex(idx)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          idx === safeIndex ? 'w-4 bg-amber-300' : 'w-1.5 bg-white/45 hover:bg-white/75'
                        }`}
                      />
                    ))}
                  </div>
                )}

                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white text-slate-900 text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap shadow-xs">
                  {activeSlide.ctaText} →
                </span>
              </div>
            </div>

            {activeBanners.length > 1 && (
              <button
                type="button"
                onClick={goNext}
                aria-label="Next Banner Slide"
                className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/25 hover:bg-black/45 text-white shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
