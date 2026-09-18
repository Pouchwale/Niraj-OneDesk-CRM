/**
 * Every account still owed and still being chased — whoever is chasing it.
 *
 * The daily plan needs two different facts about an account it asked somebody
 * to ring, and they are easy to confuse: has it been dealt with, or has it
 * simply moved to another coordinator? Answering both from one coordinator's
 * own records cannot distinguish them — the account is missing either way —
 * and that is what marked a handed-over desk's plan done overnight.
 *
 * So this reads the book whole. Only the identifying fields are fetched: the
 * caller wants a set of keys, not the records.
 */

import { demoCompanyStore, isShared } from './demo-companies'
import { sharedOwedKeys } from './shared-data'
import { openAccountKeys } from '@/features/assistant/daily-plan'

export async function getOpenAccountKeys(): Promise<Set<string>> {
  /*
   * With the records on the server, a coordinator's browser holds only their
   * own accounts, so it cannot work this out for itself — the server sends the
   * keys for the whole book alongside them.
   */
  if (isShared()) return sharedOwedKeys()
  return openAccountKeys(demoCompanyStore.getAllCompanies(), demoCompanyStore.getAllOverduePayments())
}
