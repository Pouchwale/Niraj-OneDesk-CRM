/**
 * Target schema for the Overdue Payments upload — the ageing/receivables report
 * exported from SAP or maintained in the collections sheet.
 */

import type { CompanyFieldType } from './companies-schema'

export interface OverdueTargetField {
  key: string
  label: string
  type: CompanyFieldType
  required: boolean
  aliases: string[]
  hint?: string
}

export const OVERDUE_TARGET_SCHEMA: OverdueTargetField[] = [
  {
    key: 'bp_code',
    label: 'BP Code',
    type: 'text',
    required: true,
    aliases: [
      'bp code', 'bpcode', 'bp', 'cardcode', 'card code', 'customer code',
      'party code', 'account code', 'sap code', 'code', 'customer id', 'ledger code',
    ],
    hint: 'Unique key used to match rows on re-import',
  },
  {
    key: 'customer_name',
    label: 'Customer Name',
    type: 'text',
    required: true,
    aliases: [
      'customer name', 'customer', 'company', 'company name', 'party name', 'party',
      'client name', 'client', 'bp name', 'business partner', 'account name', 'name',
      'debtor name',
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
      'responsible', 'account manager',
    ],
  },
  {
    key: 'balance_due',
    label: 'Balance Due',
    type: 'number',
    required: true,
    aliases: [
      'balance due', 'balancedue', 'balance', 'total outstanding', 'outstanding',
      'outstanding amount', 'total due', 'due amount', 'amount due', 'total balance',
      'receivable', 'net balance', 'grand total', 'total',
    ],
  },
  {
    key: 'due_0_30',
    label: 'Ageing 0-30',
    type: 'number',
    required: false,
    aliases: ['0 30', '0-30', '030', '0 to 30', 'not due', 'current', '1 30', '1-30'],
  },
  {
    key: 'due_31_60',
    label: 'Ageing 31-60',
    type: 'number',
    required: false,
    aliases: ['31 60', '31-60', '3160', '31 to 60', '30 60', '30-60'],
  },
  {
    key: 'due_61_90',
    label: 'Ageing 61-90',
    type: 'number',
    required: false,
    aliases: ['61 90', '61-90', '6190', '61 to 90', '60 90', '60-90'],
  },
  {
    key: 'due_91_120',
    label: 'Ageing 91-120',
    type: 'number',
    required: false,
    aliases: ['91 120', '91-120', '91120', '91 to 120', '90 120', '90-120'],
  },
  {
    key: 'due_121_plus',
    label: 'Ageing 121+',
    type: 'number',
    required: false,
    aliases: ['121', '121+', '121 plus', 'above 121', '120+', 'more than 120', '121 and above'],
  },
  {
    key: 'payment_terms',
    label: 'Payment Terms',
    type: 'text',
    required: false,
    aliases: [
      'payment terms', 'payment term', 'terms', 'credit terms', 'credit days',
      'terms of payment', 'payment condition',
    ],
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
      'mobile number', 'mobile no', 'telephone', 'tel', 'whatsapp', 'whatsapp number',
      'contact details',
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
    key: 'sales_person_name',
    label: 'Sales Person',
    type: 'text',
    required: false,
    aliases: ['sales person', 'salesperson', 'sales person name', 'sales executive', 'sales rep', 'sales'],
  },
  {
    key: 'department',
    label: 'Department',
    type: 'text',
    required: false,
    aliases: ['department', 'dept', 'division', 'unit', 'branch'],
  },
  {
    key: 'account_type',
    label: 'Account Type',
    type: 'text',
    required: false,
    aliases: ['account type', 'acc type', 'customer type', 'category', 'segment', 'account category'],
  },
]
