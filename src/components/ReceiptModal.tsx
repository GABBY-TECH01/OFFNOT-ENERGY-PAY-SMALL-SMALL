import React from 'react';
import { CheckCircle2, Printer, X } from 'lucide-react';
import type { Order, PaymentRecord } from '../types';
import { formatNgn } from '../utils/instalments';

interface ReceiptModalProps {
  payment: PaymentRecord;
  order?: Order | null;
  onClose: () => void;
}

export function ReceiptModal({ payment, order, onClose }: ReceiptModalProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between no-print">
          <h3 className="text-base font-bold text-slate-900">Official Payment Receipt</h3>
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
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Official Brand Header */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <img
                src="/assets/aistudio/IMG-20261027-WA0006_cf69d348.jpg"
                alt="OFFNOT ENERGY"
                className="h-14 w-auto object-contain mb-2"
              />
              <p className="text-xs text-slate-500">
                Dugbe &amp; Dalute Branches, Ibadan, Oyo State, Nigeria
              </p>
              <p className="text-xs text-slate-500">
                Tel: 07047053453 · offnotenergy@gmail.com
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-500">RECEIPT NO.</p>
              <p className="text-sm font-bold text-slate-900 font-mono-num">
                {payment.receiptNumber}
              </p>
              <div className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {payment.status}
              </div>
            </div>
          </div>

          {/* Transaction Breakdown */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Customer Name</p>
              <p className="font-semibold text-slate-900">{payment.customerName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Customer Email</p>
              <p className="font-medium text-slate-800 break-all">{payment.customerEmail}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Order Number</p>
              <p className="font-semibold font-mono-num text-slate-900">{payment.orderNumber}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Transaction Reference</p>
              <p className="font-medium font-mono-num text-slate-800 break-all">
                {payment.reference}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Payment Method</p>
              <p className="font-medium text-slate-800 uppercase">
                {payment.method.replace('_', ' ')} {payment.channel ? `(${payment.channel})` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Instalment Milestone</p>
              <p className="font-medium text-slate-800">
                {payment.instalmentNumber ? `Instalment #${payment.instalmentNumber}` : 'Full / Standard'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Amount Paid (This Receipt)</span>
              <span className="text-lg font-bold text-emerald-800 font-mono-num">
                {formatNgn(payment.amountNgn)}
              </span>
            </div>
            {order && (
              <>
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200">
                  <span>Total Order Value</span>
                  <span className="font-mono-num font-semibold">{formatNgn(order.totalAmountNgn)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Cumulative Paid to Date</span>
                  <span className="font-mono-num font-semibold">{formatNgn(order.amountPaidNgn)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                  <span>Outstanding Balance</span>
                  <span className="font-mono-num text-orange-700">
                    {formatNgn(order.outstandingBalanceNgn)}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
            Policy Notice: For instalment solar package orders, delivery, dispatch, and
            installation take place strictly after 100% full payment completion and verification.
          </p>
        </div>
      </div>
    </div>
  );
}
