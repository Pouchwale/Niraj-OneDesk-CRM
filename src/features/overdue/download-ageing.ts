/**
 * The Overdue Payments list as an Excel file: every row listed, with the
 * filters applied, and the bucket totals on a second sheet.
 *
 * One function for both download buttons on the screen (the filter row and
 * the ageing breakdown), so the two can never hand out different files.
 */

import type { AgeingBook } from '@/lib/ageing';
import type { CompanyFollowupSummary } from '@/lib/followups-api';
import type { Owner } from '@/lib/owner';
import type { OverduePayment } from '@/lib/types';

export interface AgeingDownload {
  /** Every row listed, settled ones included. */
  rows: OverduePayment[];
  /** Totals of the open rows: the same figures as the screen's footer. */
  book: AgeingBook;
  settledInFile: { count: number; amount: number };
  ownerOf: (payment: OverduePayment) => Owner;
  /** Whose rows these are, for the file name: "all coordinators", "Bhakti"... */
  scopeLabel: string;
  /** Last call and next promise per row, as the table shows them. */
  followups?: Map<string, CompanyFollowupSummary>;
}

/** yyyy-mm-dd, which Excel reads as a date and sorts correctly. */
function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export async function downloadAgeing({ rows, book, settledInFile, ownerOf, scopeLabel, followups }: AgeingDownload) {
  // Loaded on the click: the sheet library is not needed to read the page.
  const { downloadWorkbook, fileStamp } = await import('@/features/snapshots/download');
  const paise = (value: number | null | undefined) => Math.round((Number(value) || 0) * 100) / 100;

  const header = [
    'Customer', 'BP Code', 'Coordinator', 'Coordinator in CRM', 'Contact Person', 'Contact Number', 'Email',
    'Payment Terms', 'Sales Person', 'Status',
    ...book.buckets.map((b) => b.label), 'Total Due',
    'Last Follow-Up', 'Next Committed Date', 'Next Committed Amount', 'In totals',
  ];
  const body = rows.map((p) => {
    const owner = ownerOf(p);
    const summary = followups?.get(p.id);
    return [
      p.customer_name || '', p.bp_code, owner.name, owner.inCrm ? 'Yes' : 'No', p.contact_person ?? '',
      p.contact_number ?? '', p.email ?? '', p.payment_terms ?? '', p.sales_person_name ?? '',
      p.status.replace('_', ' '),
      ...book.buckets.map((b) => paise(p[b.key])), paise(p.balance_due),
      day(summary?.lastFollowupDate) || 'Never', day(summary?.nextCommittedDate),
      summary?.nextCommittedAmount ? paise(summary.nextCommittedAmount) : '',
      p.status === 'settled' ? 'No - settled in CRM' : 'Yes',
    ];
  });
  const totals = [
    'TOTAL (open accounts)', `${book.accounts} accounts`, '', '', '', '', '', '', '', '',
    ...book.buckets.map((b) => b.amount), book.balance, '', '', '', '',
  ];
  const summary = [
    ['Bucket', 'Owed', 'Credit', 'Net amount', 'Companies owing', 'Share of total %'],
    ...book.buckets.map((b) => [b.label, b.owed, b.credit, b.amount, b.accounts, Number(b.share.toFixed(2))]),
    ['Total', book.owed, book.credit, book.total, `${book.accounts} open accounts`, 100],
    ...(settledInFile.count > 0
      ? [[], [`Not counted: ${settledInFile.count} accounts marked settled in the CRM still show this on the ageing file`, settledInFile.amount]]
      : []),
  ];

  const fileName = `Overdue payments - ${scopeLabel} - ${fileStamp(new Date().toISOString())}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
  downloadWorkbook(fileName, [
    { name: 'Overdue payments', rows: [header, ...body, totals] },
    { name: 'Bucket totals', rows: summary },
  ]);
}
