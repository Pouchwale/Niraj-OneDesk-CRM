import { useMemo, useSyncExternalStore } from 'react'

import { demoCompanyStore, subscribeToDemoStore } from '@/lib/demo-companies'
import { resolveQuotationConfig, type QuotationConfig } from '@/lib/quotation-config'

/** The Quotation Sheet settings in force: the administrator's, or SAP's values where none are saved. */
export function useQuotationConfig(): QuotationConfig {
  const saved = useSyncExternalStore(subscribeToDemoStore, () => demoCompanyStore.quotationConfig)
  return useMemo(() => resolveQuotationConfig(saved), [saved])
}
