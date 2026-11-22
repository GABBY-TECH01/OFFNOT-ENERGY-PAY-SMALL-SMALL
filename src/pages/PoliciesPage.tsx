import React, { useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext';

interface PoliciesPageProps {
  initialTab?: string;
}

const TABS = [
  { id: 'instalment', label: 'Instalment Terms' },
  { id: 'faq', label: 'Frequently Asked Questions' },
  { id: 'warranty', label: 'Warranty Policy' },
  { id: 'returns', label: 'Return Policy' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms & Conditions' },
];

const FAQS = [
  {
    q: 'What is the maximum instalment repayment duration at OFFNOT ENERGY?',
    a: 'Five (5) months is the maximum repayment period for solar package instalments. Customers can choose Full Payment, 2 Months, 3 Months, 4 Months, or 5 Months.',
  },
  {
    q: 'Do I get delivery immediately after paying my first instalment?',
    a: 'No. OFFNOT ENERGY enforces a strict PAY FULLY BEFORE DELIVERY AND INSTALLATION policy. Your solar package is released, dispatched, and installed only after 100% of the total package amount is paid and verified.',
  },
  {
    q: 'Are instalment applications approved automatically?',
    a: 'No. Every instalment application is reviewed and approved or declined by OFFNOT ENERGY management before payment collection begins.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We support Paystack and Flutterwave (debit cards, bank transfers, USSD) when configured, as well as Direct Bank Transfers and branch payments verified by our Accounts team.',
  },
  {
    q: 'Can I buy an individual inverter, battery, or panel without a full package?',
    a: 'Yes. Individual solar products in our Shop section are available for standard full-payment checkout.',
  },
];

export function PoliciesPage({ initialTab = 'instalment' }: PoliciesPageProps) {
  const { storeSettings } = useStore();
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'instalment'
  );

  useEffect(() => {
    if (TABS.some((t) => t.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-2">
        Policies, Legal &amp; Customer Guide
      </p>
      <h1 className="text-3xl font-extrabold text-slate-900 mb-6">
        OFFNOT ENERGY Policies &amp; FAQ
      </h1>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        {activeTab === 'instalment' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              Instalment Payment Terms &amp; Delivery Policy
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {storeSettings.instalmentTerms}
            </p>
          </div>
        )}

        {activeTab === 'faq' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
            <div className="divide-y divide-slate-100">
              {FAQS.map((item) => (
                <div key={item.q} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="text-sm font-bold text-slate-900 mb-1.5">{item.q}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'warranty' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Warranty Policy</h2>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {storeSettings.warrantyPolicy}
            </p>
          </div>
        )}

        {activeTab === 'returns' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Return &amp; Inspection Policy</h2>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {storeSettings.returnPolicy}
            </p>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Privacy Policy</h2>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {storeSettings.privacyPolicy}
            </p>
          </div>
        )}

        {activeTab === 'terms' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Terms and Conditions</h2>
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {storeSettings.termsAndConditions}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
