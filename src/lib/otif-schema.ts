export const OTIF_CATEGORIES = ['FG - Label', 'FG - Sleeves', 'FG - Laminates'] as const;
export type OtifCategory = typeof OTIF_CATEGORIES[number];

export const DELAY_BUCKETS = [
  'On-Time / Early',
  '1-3 Days Late',
  '4-7 Days Late',
  '8-10 Days Late',
  '10+ Days Late',
] as const;
export type DelayBucket = typeof DELAY_BUCKETS[number];

export interface OtifTargetField {
  key: string;          // database column name
  label: string;        // display name
  type: 'string' | 'number' | 'date' | 'enum';
  required: boolean;
  aliases: string[];    // fuzzy match names from Excel headers
  enumValues?: string[];
}

export const OTIF_TARGET_SCHEMA: OtifTargetField[] = [
  {
    key: 'po_no',
    label: 'PO Number',
    type: 'string',
    required: true,
    aliases: [
      'po no', 'po number', 'purchase order', 'purch order', 'po#', 'po num', 'po. no.', 'po', 
      'docnum', 'doc num', 'doc. no.', 'document number', 'doc no', 'order no', 'order#', 'po id',
      'p.o.#', 'p.o. no.', 'purch order no', 'po reference', 'po ref', 'cust po', 'customer po'
    ],
  },
  {
    key: 'so_no',
    label: 'SO Number',
    type: 'string',
    required: false,
    aliases: [
      'so no', 'so number', 'sales order', 'sales order no', 'so#', 'so num', 'so. no.', 'order#', 
      'so', 'base ref', 'origin no', 's.o.#', 's.o. no.', 'sales order#', 'origin'
    ],
  },
  {
    key: 'so_date',
    label: 'SO Date',
    type: 'date',
    required: false,
    aliases: [
      'so date', 'sales order date', 'order date', 'posting date', 'doc date', 'document date', 
      'docdate', 'created date', 'so dte', 'ord date', 'order dte'
    ],
  },
  {
    key: 'po_due_date',
    label: 'PO Due Date',
    type: 'date',
    required: false,
    aliases: [
      'po due date', 'due date', 'delivery date', 'promised date', 'req. delivery date', 
      'requested date', 'docduedate', 'target date', 'expected date', 'due', 'commitment date', 
      'promise date', 'ship date', 'exp delivery date', 'scheduled date'
    ],
  },
  {
    key: 'po_closed_date',
    label: 'PO Closed Date',
    type: 'date',
    required: false,
    aliases: [
      'po closed date', 'closed date', 'actual delivery date', 'delivery completion', 
      'completed date', 'closing date', 'actual date', 'delivered date', 'closed', 
      'receipt date', 'actual delivery', 'dispatch date', 'despatch date'
    ],
  },
  {
    key: 'delay_day',
    label: 'Delay Day',
    type: 'number',
    required: false,
    aliases: [
      'delay day', 'delay days', 'days late', 'days delayed', 'lateness', 'delay', 
      'variance', 'late days', 'delayed days', 'late', 'delay (days)', 'delay (in days)',
      'delay in days', 'delay_days', 'delaydays', 'days_late', 'dayslate', 'overdue', 
      'overdue days', 'overduedays', 'delay/early', 'delay / early', 'delivery delay', 
      'dispatch delay', 'delay_day', 'delayday', 'latedays', 'variance days', 'diff', 
      'diff_days', 'days', 'delay(days)', 'delay (day)'
    ],
  },
  {
    key: 'day_committed',
    label: 'Day Committed',
    type: 'string',
    required: false,
    aliases: [
      'day committed', 'committed day', 'commitment date', 'promise day', 'committed delivery', 
      'commitment', 'promised lead time', 'agreed days', 'day commited'
    ],
  },
  {
    key: 'customer_name',
    label: 'Customer Name',
    type: 'string',
    required: true,
    aliases: [
      'customer name', 'customer', 'bp name', 'business partner name', 'client', 'client name', 
      'party name', 'buyer', 'cardname', 'card name', 'party', 'buyer name', 'customer/vendor',
      'customer bp', 'party details', 'account name'
    ],
  },
  {
    key: 'open_order_qty',
    label: 'Open Order Qty',
    type: 'number',
    required: false,
    aliases: [
      'open order qty', 'open qty', 'pending qty', 'balance qty', 'remaining qty', 
      'open quantity', 'quantity left', 'qty', 'quantity', 'order qty', 'bal qty', 
      'so qty', 'po qty', 'total qty', 'open_qty', 'openquantity', 'qty (pcs)', 'pcs'
    ],
  },
  {
    key: 'otif_score',
    label: 'OTIF Score',
    type: 'string',
    required: false,
    aliases: [
      'otif score', 'otif %', 'otif', 'on time in full', 'performance score', 'score', 
      'otif status', 'on time', 'otif result', 'otif flag'
    ],
  },
  {
    key: 'relation_manager',
    label: 'Relation Manager',
    type: 'string',
    required: false,
    aliases: [
      'relation manager', 'rm', 'account manager', 'sales rep', 'sales employee', 
      'sales person', 'rep', 'slpname', 'owner', 'coordinator', 'coordinator name', 
      'sales executive', 'person in charge', 'executive', 'handled by', 'manager'
    ],
  },
  {
    key: 'remarks',
    label: 'Remarks',
    type: 'string',
    required: false,
    aliases: [
      'remarks', 'comments', 'notes', 'description', 'text', 'free text', 'internal notes', 
      'reason', 'delay reason', 'remark', 'root cause', 'status remarks'
    ],
  },
  {
    key: 'category',
    label: 'Category',
    type: 'enum',
    required: false,
    aliases: [
      'category', 'item group', 'product group', 'material group', 'family', 'item category', 
      'section', 'division', 'type', 'group', 'product type', 'segment'
    ],
    enumValues: [...OTIF_CATEGORIES],
  },
];
