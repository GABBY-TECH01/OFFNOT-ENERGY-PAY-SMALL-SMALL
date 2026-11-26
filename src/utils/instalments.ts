import type { InstalmentScheduleItem, Product } from '../types';

export function formatNgn(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₦${safe.toLocaleString('en-NG')}`;
}

export function getEffectiveProductPrice(product: Product, isInstaller: boolean): number {
  if (isInstaller && typeof product.installerPriceNgn === 'number' && product.installerPriceNgn > 0) {
    return Math.round(product.installerPriceNgn);
  }
  return Math.round(product.priceNgn || 0);
}

export interface InstalmentCalculation {
  basePriceNgn: number;
  durationMonths: number;
  adminChargePercent: number;
  adminChargeNgn: number;
  totalPayableNgn: number;
  initialDepositPercent: number;
  initialDepositNgn: number;
  remainingPrincipalNgn: number;
  monthlyInstalmentNgn: number;
  schedule: InstalmentScheduleItem[];
  nextPaymentDueDate: string;
}

export function addMonthsIso(startDate: Date, monthsToAdd: number): string {
  const d = new Date(startDate.getTime());
  d.setMonth(d.getMonth() + monthsToAdd);
  return d.toISOString().split('T')[0];
}

export function calculateInstalmentPlan(params: {
  basePriceNgn: number;
  durationMonths: number;
  initialDepositPercent?: number;
  adminChargePercent?: number;
  startDate?: Date;
}): InstalmentCalculation {
  const basePriceNgn = Math.max(0, Math.round(params.basePriceNgn));
  // Strict 5-month maximum policy enforcement
  const durationMonths = Math.min(5, Math.max(1, Math.round(params.durationMonths)));
  const adminChargePercent =
    durationMonths === 1 ? 0 : Math.max(0, Number(params.adminChargePercent || 0));
  const initialDepositPercent =
    durationMonths === 1 ? 0 : Math.max(0, Math.min(90, Number(params.initialDepositPercent || 0)));

  const adminChargeNgn = Math.round((basePriceNgn * adminChargePercent) / 100);
  const totalPayableNgn = basePriceNgn + adminChargeNgn;
  const start = params.startDate ?? new Date();

  if (durationMonths === 1) {
    const dueDate = addMonthsIso(start, 0);
    return {
      basePriceNgn,
      durationMonths: 1,
      adminChargePercent: 0,
      adminChargeNgn: 0,
      totalPayableNgn,
      initialDepositPercent: 0,
      initialDepositNgn: totalPayableNgn,
      remainingPrincipalNgn: 0,
      monthlyInstalmentNgn: totalPayableNgn,
      nextPaymentDueDate: dueDate,
      schedule: [
        {
          instalmentNumber: 1,
          label: 'Full Payment (100%)',
          dueDate,
          amountNgn: totalPayableNgn,
          status: 'PENDING',
        },
      ],
    };
  }

  const schedule: InstalmentScheduleItem[] = [];

  if (initialDepositPercent > 0) {
    const initialDepositNgn = Math.round((totalPayableNgn * initialDepositPercent) / 100);
    const remainingPrincipalNgn = totalPayableNgn - initialDepositNgn;
    const remainingMonths = Math.max(1, durationMonths - 1);
    const baseMonthly = Math.floor(remainingPrincipalNgn / remainingMonths);
    const remainder = remainingPrincipalNgn - baseMonthly * remainingMonths;

    schedule.push({
      instalmentNumber: 1,
      label: `Initial Deposit (${initialDepositPercent}%)`,
      dueDate: addMonthsIso(start, 0),
      amountNgn: initialDepositNgn,
      status: 'PENDING',
    });

    for (let i = 1; i < durationMonths; i++) {
      const amount = i === durationMonths - 1 ? baseMonthly + remainder : baseMonthly;
      schedule.push({
        instalmentNumber: i + 1,
        label: `Month ${i + 1} Instalment`,
        dueDate: addMonthsIso(start, i),
        amountNgn: amount,
        status: 'PENDING',
      });
    }

    return {
      basePriceNgn,
      durationMonths,
      adminChargePercent,
      adminChargeNgn,
      totalPayableNgn,
      initialDepositPercent,
      initialDepositNgn,
      remainingPrincipalNgn,
      monthlyInstalmentNgn: baseMonthly,
      nextPaymentDueDate: schedule[0].dueDate,
      schedule,
    };
  }

  // Equal monthly instalments when no separate initial deposit percentage is configured
  const baseMonthly = Math.floor(totalPayableNgn / durationMonths);
  const remainder = totalPayableNgn - baseMonthly * durationMonths;

  for (let i = 0; i < durationMonths; i++) {
    const amount = i === durationMonths - 1 ? baseMonthly + remainder : baseMonthly;
    schedule.push({
      instalmentNumber: i + 1,
      label: `Instalment ${i + 1} of ${durationMonths}`,
      dueDate: addMonthsIso(start, i),
      amountNgn: amount,
      status: 'PENDING',
    });
  }

  return {
    basePriceNgn,
    durationMonths,
    adminChargePercent,
    adminChargeNgn,
    totalPayableNgn,
    initialDepositPercent: 0,
    initialDepositNgn: schedule[0].amountNgn,
    remainingPrincipalNgn: totalPayableNgn - schedule[0].amountNgn,
    monthlyInstalmentNgn: baseMonthly,
    nextPaymentDueDate: schedule[0].dueDate,
    schedule,
  };
}

export function buildWhatsAppLink(message: string, phoneNumber = '2347047053453'): string {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
}

export function formatOrderStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'PENDING MANAGEMENT APPROVAL';
    case 'AWAITING_PAYMENT':
      return 'AWAITING PAYMENT';
    case 'IN_INSTALMENT':
      return 'INSTALMENT IN PROGRESS';
    case 'FULLY_PAID_AWAITING_DELIVERY':
      return 'FULLY PAID – AWAITING DELIVERY';
    case 'SCHEDULED_FOR_INSTALLATION':
      return 'SCHEDULED FOR INSTALLATION';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'REJECTED':
      return 'APPLICATION DECLINED';
    default:
      return status;
  }
}

export function downloadCsv(filename: string, rows: Record<string, string | number | boolean | undefined>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? '';
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
