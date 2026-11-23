import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { copyRich } from '@/lib/customer-statement'

/**
 * Copies the invoice table with its lines, to paste into any other email or
 * sheet with Ctrl+V (23 Nov 2026). Programs that cannot take a lined table get
 * the plain text one.
 */
export function CopyTableButton({ html, text, className, testId }: { html: string; text: string; className?: string; testId: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const copy = () => {
    if (!copyRich(html, text)) {
      toast.error('Could not copy the table. Select it and copy it instead.')
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
    toast.success('Table copied.', { description: 'Press Ctrl+V in any email to paste it.' })
  }
  return (
    <Button type="button" size="sm" variant="outline" className={className} onClick={copy} data-testid={testId}>
      {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy table'}
    </Button>
  )
}
