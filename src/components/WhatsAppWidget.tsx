import React from 'react';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppLink } from '../utils/instalments';

export function WhatsAppWidget() {
  const url = buildWhatsAppLink(
    'Hello OFFNOT ENERGY Customer Service, I would like information about your solar packages and instalment plans.'
  );

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with OFFNOT ENERGY on WhatsApp"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800 transition-transform hover:-translate-y-0.5 no-print"
    >
      <MessageCircle className="w-5 h-5" />
      <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">
        WhatsApp · 07047053453
      </span>
    </a>
  );
}
