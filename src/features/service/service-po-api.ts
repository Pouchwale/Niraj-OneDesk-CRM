/** One PO's details from the Service-AutoPO workbook, looked up on the server (server/modules/service-po). */

import { SERVICE_PO_ROUTE, type ServicePoResponse } from '../../../shared/service-po'

export async function lookupServicePo(po: string): Promise<ServicePoResponse> {
  let response: Response
  try {
    response = await fetch(`${SERVICE_PO_ROUTE}?po=${encodeURIComponent(po)}`)
  } catch {
    throw new Error('The server is not answering; fill the fields yourself.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'The PO could not be looked up; fill the fields yourself.')
  return body as ServicePoResponse
}
