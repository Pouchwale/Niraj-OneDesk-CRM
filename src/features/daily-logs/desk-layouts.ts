/**
 * What each coordinator is asked to record each day.
 *
 * The two businesses do not track the same work, and inside Pouchwale each
 * person runs a different desk: artworks, orders, updates and dispatch each
 * have their own sheet with their own columns. Encoding that as a layout per
 * desk keeps the form honest - somebody on the dispatch desk is never asked for
 * a quotation count they have no way of knowing - and it means adding a desk is
 * a data change rather than another branch in the JSX.
 */

import type { DeskId, Profile } from '@/lib/types'

export type FieldKind = 'number' | 'currency' | 'text' | 'mode'

export interface EntryField {
  /** Key on both the form values and the saved entry. */
  name: string
  label: string
  kind: FieldKind
  hint?: string
  fullWidth?: boolean
}

export interface EntrySection {
  id: string
  title: string
  /** Named so the form can pick the icon without importing components here. */
  icon: 'package' | 'printer' | 'phone' | 'users' | 'cart' | 'briefcase' | 'palette' | 'truck' | 'refresh'
  badge?: string
  note?: string
  fields: EntryField[]
}

export interface DeskLayout {
  id: string
  /** Shown under the page title, e.g. "Artworks @ Pouchwale". */
  name: string
  /**
   * The one number that best represents this desk's output.
   *
   * Desks measure different work, so charting them on a shared axis would
   * compare artworks to dispatches. Each desk declares its own headline instead,
   * and the team view draws them as small multiples with their own labels.
   */
  headline: { field: string; label: string }
  sections: EntrySection[]
}

/* ===== Reusable field groups ===== */

const PAYMENT_FOLLOWUP_FIELDS: EntryField[] = [
  { name: 'payment_calls', label: 'Calls (Advance)', kind: 'number' },
  { name: 'payment_emails', label: 'Emails (Advance)', kind: 'number' },
  { name: 'overdue_calls', label: 'Overdue Calls', kind: 'number' },
  { name: 'overdue_emails', label: 'Overdue Emails', kind: 'number' },
]

const EXTRAORDINARY: EntryField = {
  name: 'extraordinary_work',
  label: 'Extraordinary Work',
  kind: 'text',
  fullWidth: true,
}

/* ===== The shared coordinator layout ===== */

const CORE_SECTIONS: EntrySection[] = [
  {
    id: 'payment',
    title: 'Payment Follow-ups',
    icon: 'phone',
    fields: PAYMENT_FOLLOWUP_FIELDS,
  },
  {
    id: 'leads',
    title: 'Lead Generation',
    icon: 'users',
    fields: [
      { name: 'fresh_leads', label: 'Fresh Leads', kind: 'number' },
      { name: 'mode_of_leads', label: 'Mode of Leads', kind: 'mode' },
      { name: 'leads_connected', label: 'Leads Connected', kind: 'number' },
      { name: 'expected_business', label: 'Expected Business (₹)', kind: 'currency', hint: 'e.g. 1.8L' },
    ],
  },
  {
    id: 'sales',
    title: 'Sales Activity',
    icon: 'cart',
    fields: [
      { name: 'quotations_given', label: 'Quotations Given', kind: 'number' },
      { name: 'quotations_followed', label: 'Quotations Followed', kind: 'number' },
      { name: 'orders_received', label: 'Orders Received', kind: 'number' },
      { name: 'sales_amount', label: 'Sales (₹)', kind: 'currency', hint: 'e.g. 50k' },
      { name: 'payment_collected', label: 'Payment Collected (₹)', kind: 'currency', hint: 'e.g. 1L', fullWidth: true },
    ],
  },
  {
    id: 'additional',
    title: 'Additional Tasks',
    icon: 'briefcase',
    fields: [
      { name: 'customer_visits', label: 'Customer Visits', kind: 'number' },
      { name: 'pending_work', label: 'Pending Work', kind: 'number' },
      { name: 'cross_selling', label: 'Cross Selling', kind: 'number' },
      { name: 'cross_selling_value', label: 'Cross Sell Value (₹)', kind: 'currency', hint: 'e.g. 10k' },
      { name: 'errors', label: 'Errors', kind: 'number' },
      EXTRAORDINARY,
    ],
  },
]

/* ===== GP3 ===== */

const GP3_LAYOUT: DeskLayout = {
  id: 'gp3',
  name: 'Team GP3',
  headline: { field: 'sales_orders', label: 'Sales Orders' },
  sections: [
    {
      id: 'order-desk',
      title: 'Order Desk',
      icon: 'package',
      badge: 'Only for Team B',
      fields: [
        { name: 'business_partners', label: 'Business Partners', kind: 'number' },
        { name: 'item_masters', label: 'Item Masters', kind: 'number' },
        { name: 'sales_orders', label: 'Sales Orders', kind: 'number' },
        { name: 'dispatches', label: 'Dispatches', kind: 'number', hint: 'Same-day dispatch not possible' },
        { name: 'digital_quotations', label: 'Digital Quotations', kind: 'number' },
        { name: 'digital_quotations_converted', label: 'Converted', kind: 'number' },
        { name: 'order_errors', label: 'Errors', kind: 'number' },
      ],
    },
    {
      id: 'konica',
      title: 'Konica Digital',
      icon: 'printer',
      note: 'To be automated later — for now add the customer short names in Extraordinary Work.',
      fields: [
        { name: 'konica_item_masters', label: 'Item Masters', kind: 'number' },
        { name: 'konica_sales_orders', label: 'Sales Orders', kind: 'number' },
        { name: 'konica_value', label: 'Value (₹)', kind: 'currency', hint: 'e.g. 1.2L' },
        { name: 'konica_errors', label: 'Errors', kind: 'number' },
      ],
    },
    ...CORE_SECTIONS,
  ],
}

/* ===== Pouchwale, one desk per person ===== */

const ARTWORKS_LAYOUT: DeskLayout = {
  id: 'pouchwale-artworks',
  name: 'Artworks @ Pouchwale',
  headline: { field: 'item_masters', label: 'Item Masters' },
  sections: [
    {
      id: 'artworks',
      title: 'Artworks',
      icon: 'palette',
      fields: [
        { name: 'business_partners', label: 'Business Partners', kind: 'number' },
        { name: 'item_masters', label: 'Item Masters', kind: 'number' },
        { name: 'calls_made', label: 'Calls', kind: 'number' },
        { name: 'so_po_cross_checks', label: 'SO & PO Cross Checks', kind: 'number' },
        { name: 'errors', label: 'Errors', kind: 'number' },
        EXTRAORDINARY,
      ],
    },
  ],
}

const ORDERS_LAYOUT: DeskLayout = {
  id: 'pouchwale-orders',
  name: 'Orders @ Pouchwale',
  headline: { field: 'sales_orders', label: 'Sales Orders' },
  sections: [
    {
      id: 'orders',
      title: 'Orders',
      icon: 'cart',
      fields: [
        { name: 'payment_confirmations', label: 'Payment Confirmations', kind: 'number' },
        { name: 'sales_orders', label: 'Sales Orders', kind: 'number' },
        { name: 'production_orders', label: 'Production Orders', kind: 'number' },
        { name: 'so_po_cross_checks', label: 'SO & PO Cross Checks', kind: 'number' },
        {
          name: 'orders_without_payment_confirmation',
          label: 'Orders without payment confirmation',
          kind: 'number',
          hint: 'Advance-term customers only',
          fullWidth: true,
        },
      ],
    },
    { id: 'payment', title: 'Payment Follow-ups', icon: 'phone', fields: PAYMENT_FOLLOWUP_FIELDS },
    { id: 'extra', title: 'Notes', icon: 'briefcase', fields: [EXTRAORDINARY] },
  ],
}

const UPDATES_LAYOUT: DeskLayout = {
  id: 'pouchwale-updates',
  name: 'Updates @ Pouchwale',
  headline: { field: 'production_planning', label: 'Production Planning' },
  sections: [
    {
      id: 'updates',
      title: 'Updates',
      icon: 'refresh',
      fields: [
        { name: 'production_planning', label: 'Production Planning', kind: 'number' },
        { name: 'address_confirmations', label: 'Address Confirmations', kind: 'number' },
        { name: 'service_emails', label: 'Service Emails', kind: 'number' },
        { name: 'errors', label: 'Errors', kind: 'number' },
      ],
    },
    { id: 'payment', title: 'Payment Follow-ups', icon: 'phone', fields: PAYMENT_FOLLOWUP_FIELDS },
    { id: 'extra', title: 'Notes', icon: 'briefcase', fields: [EXTRAORDINARY] },
  ],
}

const DISPATCH_LAYOUT: DeskLayout = {
  id: 'pouchwale-dispatch',
  name: 'Dispatch @ Pouchwale',
  headline: { field: 'dispatches', label: 'Dispatches' },
  sections: [
    {
      id: 'dispatch',
      title: 'Dispatch',
      icon: 'truck',
      fields: [
        { name: 'dispatches', label: 'Dispatches', kind: 'number' },
        { name: 'rfd_followup_emails', label: 'RFD Follow-up (Email)', kind: 'number' },
        { name: 'rfd_followup_calls', label: 'RFD Follow-up (Call)', kind: 'number' },
        { name: 'complaints_received', label: 'Complaints Received', kind: 'number' },
        { name: 'complaints_resolved', label: 'Complaints Resolved', kind: 'number' },
        { name: 'errors', label: 'Errors', kind: 'number' },
        EXTRAORDINARY,
      ],
    },
  ],
}

const DEFAULT_LAYOUT: DeskLayout = {
  id: 'default',
  name: 'Daily Activity',
  headline: { field: 'orders_received', label: 'Orders Received' },
  sections: CORE_SECTIONS,
}

/** The Pouchwale desks an administrator can seat a coordinator at. */
export const DESK_LAYOUTS: Record<DeskId, DeskLayout> = {
  artworks: ARTWORKS_LAYOUT,
  orders: ORDERS_LAYOUT,
  updates: UPDATES_LAYOUT,
  dispatch: DISPATCH_LAYOUT,
}

export const DESK_OPTIONS: { value: DeskId; label: string }[] = [
  { value: 'artworks', label: 'Artworks' },
  { value: 'orders', label: 'Orders' },
  { value: 'updates', label: 'Updates' },
  { value: 'dispatch', label: 'Dispatch' },
]

/**
 * Desks for the coordinators the app shipped with, by profile id.
 *
 * Only a fallback for rosters saved before the desk lived on the profile; the
 * admin panel writes `desk` directly now, so an account created there is
 * seated the same way as a seeded one.
 */
const LEGACY_DESKS: Record<string, DeskId> = {
  'coord-9': 'artworks', // Vishva Vyas
  'coord-7': 'orders', // Krina Shah
  'coord-10': 'updates', // Disha Acharya
  'coord-11': 'dispatch', // Avani Patel
}

/** The form layout for a given person. */
export function deskFor(profile: Pick<Profile, 'id' | 'role' | 'module' | 'desk'> | null | undefined): DeskLayout {
  if (!profile || profile.role !== 'coordinator') return DEFAULT_LAYOUT
  if (profile.module === 'GP3') return GP3_LAYOUT
  // A Pouchwale coordinator with no desk assigned yet falls back to the shared
  // layout rather than to an empty form.
  if (profile.module === 'Pouchwale') {
    const desk = profile.desk ?? LEGACY_DESKS[profile.id]
    return desk ? DESK_LAYOUTS[desk] : DEFAULT_LAYOUT
  }
  return DEFAULT_LAYOUT
}

/** Every field the layout asks for, flattened. */
export function fieldsOf(layout: DeskLayout): EntryField[] {
  return layout.sections.flatMap((section) => section.fields)
}

export { DEFAULT_LAYOUT, GP3_LAYOUT }
