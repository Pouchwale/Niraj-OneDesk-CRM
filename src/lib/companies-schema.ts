/**
 * Target schema for the Companies (payment follow-up) upload.
 * Every field carries the aliases we see in real SAP/Tally/Excel exports so the
 * upload wizard can auto-map columns without the admin touching anything.
 */

export type CompanyFieldType = 'text' | 'number' | 'date'

export interface CompanyTargetField {
  key: string
  label: string
  type: CompanyFieldType
  required: boolean
  aliases: string[]
  hint?: string
}

export const COMPANY_TARGET_SCHEMA: CompanyTargetField[] = [
  {
    key: 'company_name',
    label: 'Company Name',
    type: 'text',
    required: true,
    aliases: [
      'company', 'company name', 'customer', 'customer name', 'client', 'client name',
      'party', 'party name', 'bp name', 'business partner', 'business partner name',
      'account name', 'name', 'firm name', 'buyer name', 'debtor name',
    ],
  },
  {
    key: 'sap_bp_code',
    label: 'SAP / BP Code',
    type: 'text',
    required: false,
    aliases: [
      'bp code', 'bpcode', 'cardcode', 'card code', 'erp cardcode', 'sap code',
      'customer code', 'party code', 'account code', 'client code', 'bp', 'code',
      'customer id', 'ledger code',
    ],
    hint: 'Used as the unique key for updating existing companies',
  },
  {
    // What tells one row of an invoice export from the next. Not required: a
    // file with one row per customer has no invoice number and needs none.
    key: 'invoice_no',
    label: 'Invoice No',
    type: 'text',
    required: false,
    aliases: [
      'invoice no', 'invoice number', 'invoice #', 'invoice num', 'invoiceno',
      'inv no', 'inv #', 'invno', 'bill no', 'bill number', 'document no',
      'document number', 'doc no', 'docno', 'voucher no', 'reference no',
      'invoice', 'bill',
    ],
  },
  {
    key: 'coordinator_name',
    label: 'Coordinator',
    type: 'text',
    required: true,
    aliases: [
      'coordinator', 'coordinator name', 'co ordinator', 'coord', 'relation manager',
      'relationship manager', 'rm', 'rm name', 'owner', 'assigned to', 'assignee',
      'executive', 'sales executive', 'sales person', 'salesperson', 'responsible',
      'account manager',
    ],
  },
  {
    key: 'payment_terms',
    label: 'Payment Terms',
    type: 'text',
    required: true,
    aliases: [
      'payment terms', 'payment term', 'paymentterms', 'terms', 'term',
      'credit terms', 'credit term', 'credit days', 'creditdays', 'terms of payment',
      'payment condition', 'payterm', 'pmt terms',
    ],
  },
  {
    key: 'total_amount',
    label: 'Total Amount',
    type: 'number',
    required: true,
    aliases: [
      'payment term total amount', 'total amount', 'total', 'amount',
      'invoice amount', 'invoice value', 'bill amount', 'net amount', 'grand total',
      'outstanding', 'outstanding amount', 'balance', 'balance due', 'due amount',
      'total due', 'receivable', 'value',
    ],
  },
  {
    key: 'invoice_date',
    label: 'Invoice Date',
    type: 'date',
    required: true,
    aliases: [
      'invoice date', 'invoicedate', 'bill date', 'billing date', 'doc date',
      'document date', 'posting date', 'inv date', 'date of invoice', 'invoice dt',
    ],
  },
  {
    key: 'due_date',
    label: 'Due Date',
    type: 'date',
    required: false,
    aliases: [
      'due date', 'duedate', 'payment due date', 'maturity date', 'net due date',
      'due on', 'expected payment date',
    ],
    hint: 'Derived from Invoice Date + Payment Terms when not supplied',
  },
  {
    key: 'contact_person',
    label: 'Contact Person',
    type: 'text',
    required: false,
    aliases: [
      'contact person', 'contact', 'contact name', 'person', 'spoc',
      'accounts contact', 'concerned person', 'attention',
    ],
  },
  {
    key: 'contact_number',
    label: 'Contact Number',
    type: 'text',
    required: false,
    aliases: [
      'contact number', 'contact no', 'phone', 'phone number', 'phone no', 'mobile',
      'mobile number', 'mobile no', 'telephone', 'tel', 'whatsapp', 'contact details',
    ],
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    required: false,
    aliases: ['email', 'email id', 'e mail', 'mail', 'mail id', 'email address'],
  },
  {
    key: 'module',
    label: 'Module / Division',
    type: 'text',
    required: false,
    aliases: ['module', 'division', 'unit', 'department', 'dept', 'company code', 'branch', 'plant'],
  },
  {
    key: 'remarks',
    label: 'Remarks',
    type: 'text',
    required: false,
    aliases: ['remarks', 'remark', 'notes', 'note', 'comment', 'comments', 'description'],
  },
]

/** Back-compat export consumed by the upload dialog. */
export const COMPANY_FIELD_ALIASES: Record<string, string[]> = Object.fromEntries(
  COMPANY_TARGET_SCHEMA.map((f) => [f.key, f.aliases])
)
