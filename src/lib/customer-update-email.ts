/**
 * Robi's draft of the order-update email to a customer (27 Nov 2026, the
 * user's request): written from the open job's dates, never sent by the CRM.
 * The coordinator reads it, changes what they like, and sends it from their
 * own mail. Early / on time / delayed by N days, from shared/open-jobs.ts.
 */

import type { CustomerUpdate } from '../../shared/open-jobs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "30 Nov 2026" */
export const longDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`

export interface UpdateEmail {
  subject: string
  body: string
}

/** How the order is described to the customer: its job name and sales order, as far as they are known. */
function orderName(u: CustomerUpdate): string {
  const parts = [u.job.jobName && `"${u.job.jobName}"`, u.job.salesOrderNo && `Sales Order ${u.job.salesOrderNo}`].filter(Boolean)
  return parts.length ? `your order ${parts.join(', ')}` : 'your order'
}

/** The draft. `sender` is the coordinator's name, `org` the company line under it (may be blank). */
export function customerUpdateEmail(u: CustomerUpdate, sender: string, org = ''): UpdateEmail {
  const due = u.job.dueDate ? longDate(u.job.dueDate) : ''
  const rfd = u.job.rfdDate ? longDate(u.job.rfdDate) : ''
  const order = orderName(u)
  const ref = u.job.salesOrderNo ? `Sales Order ${u.job.salesOrderNo}` : u.job.jobName ?? 'your order'
  const greeting = `Dear ${u.job.customerName?.trim() || 'Sir/Madam'},`
  const sign = ['Warm regards,', sender, org].filter((l) => l && l.trim()).join('\n')

  if (u.status === 'Delay') {
    return {
      subject: `Update on ${ref}: revised dispatch date ${rfd}`,
      body: [
        greeting,
        '',
        `We would like to keep you informed about ${order}. It is now planned to be ready for dispatch on ${rfd}, ${dayWord(u.days)} after the committed date of ${due}.`,
        '',
        'We sincerely apologise for the delay. Our team is working to complete it as early as possible, and we will let you know at once if it can be dispatched sooner.',
        '',
        'Please feel free to reach out if you have any questions.',
        '',
        sign,
      ].join('\n'),
    }
  }
  if (u.status === 'Early') {
    return {
      subject: `Update on ${ref}: ready for dispatch on ${rfd}`,
      body: [
        greeting,
        '',
        `Good news about ${order}: it will be ready for dispatch on ${rfd}, ${dayWord(u.days)} ahead of the committed date of ${due}.`,
        '',
        'We will share the dispatch details as soon as it leaves our facility.',
        '',
        sign,
      ].join('\n'),
    }
  }
  return {
    subject: `Update on ${ref}: on schedule for ${rfd}`,
    body: [
      greeting,
      '',
      `We are pleased to confirm that ${order} is on schedule and will be ready for dispatch on ${rfd}, as committed.`,
      '',
      'We will share the dispatch details as soon as it leaves our facility.',
      '',
      sign,
    ].join('\n'),
  }
}

/** The Service record's remark for a customer told from the reminder. */
export function toldRemark(u: CustomerUpdate): string {
  const how = u.status === 'Delay' ? `delayed by ${dayWord(u.days)}` : u.status === 'Early' ? `early by ${dayWord(u.days)}` : 'on time'
  return `Order update emailed (Robi's reminder): RFD ${u.job.rfdDate ? longDate(u.job.rfdDate) : '-'} against due ${u.job.dueDate ? longDate(u.job.dueDate) : '-'}, ${how}.`
}
