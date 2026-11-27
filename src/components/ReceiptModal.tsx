import React from 'react';
import { CheckCircle2, Printer, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Order, PaymentRecord } from '../types';
import { formatNgn } from '../utils/instalments';

interface ReceiptModalProps {
  payment: PaymentRecord;
  order?: Order | null;
  onClose: () => void;
}

export function ReceiptModal({ payment, order, onClose }: ReceiptModalProps) {
  const { logoUrl } = useStore();
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between no-print shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Official Payment Receipt</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
          {/* Official Brand Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <img
                src={logoUrl}
                alt="OFFNOT ENERGY"
                className="h-14 w-auto object-contain mb-2 rounded-lg bg-white p-1"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dugbe &amp; Dalute Branches, Ibadan, Oyo State, Nigeria
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tel: 07047053453 · offnotenergy@gmail.com
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">RECEIPT NO.</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono-num">
                {payment.receiptNumber}
              </p>
              <div className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {payment.status}
              </div>
            </div>
          </div>

          {/* Transaction Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Customer Name</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{payment.customerName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Customer Email</p>
              <p className="font-medium text-slate-800 dark:text-slate-200 break-all">{payment.customerEmail}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Order Number</p>
              <p className="font-semibold font-mono-num text-slate-900 dark:text-slate-100">{payment.orderNumber}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Transaction Reference</p>
              <p className="font-medium font-mono-num text-slate-800 dark:text-slate-200 break-all">
                {payment.reference}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Payment Method</p>
              <p className="font-medium text-slate-800 dark:text-slate-200 uppercase">
                {payment.method.replace('_', ' ')} {payment.channel ? `(${payment.channel})` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Instalment Milestone</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {payment.instalmentNumber ? `Instalment #${payment.instalmentNumber}` : 'Full / Standard'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Amount Paid (This Receipt)</span>
              <span className="text-lg font-bold text-emerald-800 dark:text-emerald-400 font-mono-num">
                {formatNgn(payment.amountNgn)}
              </span>
            </div>
            {order && (
              <>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Order Value</span>
                  <span className="font-mono-num font-semibold">{formatNgn(order.totalAmountNgn)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span>Cumulative Paid to Date</span>
                  <span className="font-mono-num font-semibold">{formatNgn(order.amountPaidNgn)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <span>Outstanding Balance</span>
                  <span className="font-mono-num text-orange-700 dark:text-orange-400">
                    {formatNgn(order.outstandingBalanceNgn)}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
            Policy Notice: For instalment solar package orders, delivery, dispatch, and
            installation take place strictly after 100% full payment completion and verification.
          </p>
        </div>
      </div>
    </div>
  );
}
