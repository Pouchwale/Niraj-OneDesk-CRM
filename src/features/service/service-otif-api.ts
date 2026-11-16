/** The Service score's Total Customers from the OTIF file, as the server counts them (server/modules/service-otif). */

import { SERVICE_OTIF_ROUTE, type ServiceOtifResponse } from '../../../shared/service-otif'

export async function getServiceOtif(): Promise<ServiceOtifResponse> {
  let response: Response
  try {
    response = await fetch(SERVICE_OTIF_ROUTE)
  } catch {
    throw new Error('The server is not answering. The OTIF file is read on the machine that runs the app.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? 'The server refused that.')
  return body as ServiceOtifResponse
}
