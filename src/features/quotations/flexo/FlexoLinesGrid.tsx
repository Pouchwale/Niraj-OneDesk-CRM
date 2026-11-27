/**
 * Quotation Sheet lines as SAP's grid (27 Nov 2026, the user's request: "the
 * fronted looks like this", SAP's Flexo Rate Sheet). One row per line, SAP's
 * 22 columns in SAP's order; only the grid scrolls sideways, with # and Job
 * Name kept in view on the left and the row buttons on the right.
 *
 * Copying, as coordinators do in SAP:
 *  - click a row number to select it (Shift for a range, Ctrl for more), then
 *    Ctrl+C; Ctrl+V adds the copies below the selected row, as often as wanted;
 *  - Duplicate (a row's button, or the toolbar for the selected rows) adds a
 *    copy right below;
 *  - rows copied in Excel (columns in SAP's order) paste in as new lines.
 * The copied rows are ordinary tab-separated text, so they also paste into Excel.
 */

import { useRef, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { GRID_COLUMNS, choicesOf, copyLines, insertLines, isBlankLine, linesToTsv, padLines, tsvToLines } from '@/lib/flexo-grid'
import { blankFlexoLine, type Choice, type FlexoRateLine } from '@/lib/flexo-rate-sheet'
import type { QuotationLists } from '@/lib/quotation-config'
import { cn } from '@/lib/utils'

// SAP-sized cells: small text, one line, so many columns and rows fit the page.
const cellClass =
  'h-7 w-full min-w-0 border-0 bg-transparent px-1 text-xs outline-none focus:bg-background focus:ring-2 focus:ring-inset focus:ring-primary'
const NUM_W = 34
const ACTIONS_W = 56

function ChoiceCell({ value, choices, onChange, label, readOnly }: { value: string; choices: Choice[]; onChange: (v: string) => void; label: string; readOnly?: boolean }) {
  // A value taken out of the list later still shows on the sheets that have it.
  const shown = value && !choices.some((c) => c.code === value) ? [...choices, { code: value, description: value }] : choices
  return (
    <select aria-label={label} className={cn(cellClass, 'pr-0 disabled:cursor-default disabled:opacity-100')} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
      <option value="" />
      {shown.map((c) => (
        <option key={c.code} value={c.code}>
          {c.description}
        </option>
      ))}
    </select>
  )
}

/** A number cell: empty is "no value". */
function NumberCell({ value, onChange, label, step, empty, readOnly }: { value: number | null; onChange: (v: number | null) => void; label: string; step: string; empty?: boolean; readOnly?: boolean }) {
  // Final Rate shows five decimals, as SAP's grid does ("0.00000"); an empty row shows nothing.
  const [text, setText] = useState(value === null || empty ? '' : step === '0.00001' ? value.toFixed(5) : String(value))
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      readOnly={readOnly}
      aria-label={label}
      className={cn(cellClass, 'text-right tabular-nums placeholder:text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
      value={text}
      // A filled row's empty Final Rate reads 0.00000, as in SAP.
      placeholder={step === '0.00001' && !empty ? '0.00000' : undefined}
      onChange={(e) => {
        setText(e.target.value)
        const t = e.target.value.trim()
        const n = Number(t)
        onChange(t === '' || !Number.isFinite(n) ? null : n)
      }}
    />
  )
}

export function FlexoLinesGrid({
  lines,
  setLines: setAllLines,
  lists,
  newId,
  readOnly = false,
}: {
  /** A saved sheet a coordinator opens: rows can be selected and copied (Ctrl+C), nothing changed. */
  readOnly?: boolean
  lines: FlexoRateLine[]
  setLines: (update: (lines: FlexoRateLine[]) => FlexoRateLine[]) => void
  lists: QuotationLists
  newId: () => string
}) {
  const [selected, setSelected] = useState<string[]>([])
  const anchor = useRef<string | null>(null)
  // Every change keeps a page of empty rows under the lines, as SAP's grid does.
  const setLines = (update: (lines: FlexoRateLine[]) => FlexoRateLine[]) => setAllLines((ls) => padLines(update(ls), newId))
  const setLine = (id: string, patch: Partial<FlexoRateLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const inOrder = (ids: string[]) => lines.filter((l) => ids.includes(l.id))

  const pick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = lines.findIndex((l) => l.id === anchor.current)
      const b = lines.findIndex((l) => l.id === id)
      const [from, to] = a < b ? [a, b] : [b, a]
      setSelected(lines.slice(from, to + 1).map((l) => l.id))
      return
    }
    anchor.current = id
    if (e.ctrlKey || e.metaKey) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    else setSelected([id])
  }

  /** Copies of `source` go below the last of them; the copies become the selection. */
  const duplicate = (picked: FlexoRateLine[]) => {
    const source = picked.filter((l) => !isBlankLine(l))
    if (source.length === 0) return
    const copies = copyLines(source, newId)
    setLines((ls) => insertLines(ls, copies, source[source.length - 1].id))
    setSelected(copies.map((c) => c.id))
    anchor.current = copies[0].id
  }

  const remove = (ids: string[]) => {
    setLines((ls) => {
      const left = ls.filter((l) => !ids.includes(l.id))
      return left.length ? left : [blankFlexoLine(newId())]
    })
    setSelected((s) => s.filter((x) => !ids.includes(x)))
  }

  const rowOf = (target: EventTarget | null) => (target instanceof HTMLElement ? target.closest<HTMLElement>('[data-line-id]')?.dataset.lineId ?? null : null)
  const onRowHandle = (target: EventTarget | null) => target instanceof HTMLElement && target.dataset.rowHandle === 'true'

  // Ctrl+C on a selected row number: the rows go on the clipboard as tab-separated text.
  const onCopy = (e: React.ClipboardEvent) => {
    if (!onRowHandle(e.target) || selected.length === 0) return
    e.preventDefault()
    const rows = inOrder(selected)
    e.clipboardData.setData('text/plain', linesToTsv(rows))
    toast.success(`${rows.length} line${rows.length === 1 ? '' : 's'} copied.`, { description: 'Ctrl+V on a row number pastes them below it.' })
  }

  // Ctrl+V: grid rows (from here or Excel) become new lines below the row; one plain value is left to the cell.
  const onPaste = (e: React.ClipboardEvent) => {
    if (readOnly) return
    const pasted = tsvToLines(e.clipboardData.getData('text/plain'), lists, newId)
    if (!pasted) return
    e.preventDefault()
    if (pasted.length === 0) return
    const after = rowOf(e.target) ?? (selected.length ? inOrder(selected).at(-1)?.id ?? null : null)
    setLines((ls) => insertLines(ls, pasted, after))
    setSelected(pasted.map((l) => l.id))
    anchor.current = pasted[0].id
    toast.success(`${pasted.length} line${pasted.length === 1 ? '' : 's'} pasted.`)
  }

  const gridWidth = NUM_W + GRID_COLUMNS.reduce((s, c) => s + c.width, 0) + ACTIONS_W

  return (
    <div className="space-y-2" data-testid="flexo-grid">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-2 text-sm font-semibold">Lines</h4>
        {readOnly ? (
          <span className="text-xs text-muted-foreground" data-testid="flexo-grid-readonly">
            Saved sheet: only the administrator or the team leader can change it. To start from it, click a row number (Shift or Ctrl for more), Ctrl+C, then
            New sheet and Ctrl+V there.
          </span>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setLines((ls) => [...ls, blankFlexoLine(newId())])} data-testid="flexo-add-line">
              <Plus className="mr-1.5 h-4 w-4" /> Add line
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={selected.length === 0} onClick={() => duplicate(inOrder(selected))} data-testid="flexo-duplicate-selected">
              <Copy className="mr-1.5 h-4 w-4" /> Duplicate{selected.length > 1 ? ` ${selected.length} lines` : ''}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" disabled={selected.length === 0} onClick={() => remove(selected)} data-testid="flexo-remove-selected">
              <Trash2 className="mr-1.5 h-4 w-4" /> Remove{selected.length > 1 ? ` ${selected.length} lines` : ''}
            </Button>
            <span className="text-xs text-muted-foreground">
              Click a row number to select it (Shift or Ctrl for more), Ctrl+C to copy, then Ctrl+V on a row number to paste the copies below it. Rows copied in Excel paste in too.
            </span>
          </>
        )}
      </div>

      {/* SAP's grid: it fills the page and scrolls inside itself, both ways; the headings stay on top. */}
      {/* `isolate`: the frozen headings and columns stack inside the grid only, so they never paint over the page's Add / Cancel bar. */}
      <div className="isolate max-h-[68vh] overflow-auto rounded-md border border-border bg-background" onCopy={onCopy} onPaste={onPaste} data-testid="flexo-grid-scroll">
        <table className="table-fixed border-separate border-spacing-0 text-xs" style={{ width: gridWidth }} data-testid="flexo-grid-table">
          <colgroup>
            <col style={{ width: NUM_W }} />
            {GRID_COLUMNS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            <col style={{ width: ACTIONS_W }} />
          </colgroup>
          <thead>
            <tr className="bg-muted text-left text-xs text-muted-foreground">
              <th className="sticky left-0 top-0 z-30 border-b border-r border-border bg-muted px-1 py-1.5 font-medium">#</th>
              {GRID_COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  title={c.label}
                  className={cn('sticky top-0 z-20 truncate whitespace-nowrap border-b border-r border-border bg-muted px-1 py-1.5 font-medium', i === 0 && 'z-30')}
                  style={i === 0 ? { left: NUM_W } : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className="sticky right-0 top-0 z-30 border-b border-border bg-muted" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, r) => {
              const on = selected.includes(l.id)
              const empty = isBlankLine(l)
              return (
                <tr key={l.id} data-line-id={l.id} className={cn('group', on && 'bg-primary/10')} data-testid="flexo-line">
                  <td className={cn('sticky left-0 z-10 border-b border-r border-border p-0', on ? 'bg-primary' : 'bg-muted')}>
                    <button
                      type="button"
                      data-row-handle="true"
                      className={cn('h-7 w-full text-xs tabular-nums outline-none focus:ring-2 focus:ring-inset focus:ring-primary', on ? 'font-semibold text-primary-foreground' : 'text-muted-foreground')}
                      onClick={(e) => pick(l.id, e)}
                      onKeyDown={(e) => e.key === 'Escape' && setSelected([])}
                      aria-pressed={on}
                      aria-label={`Line ${r + 1}`}
                      data-testid="flexo-row-number"
                    >
                      {r + 1}
                    </button>
                  </td>
                  {GRID_COLUMNS.map((c, i) => {
                    const choices = choicesOf(c.kind, lists)
                    const label = `${c.label}, line ${r + 1}`
                    return (
                      <td
                        key={c.key}
                        className={cn('border-b border-r border-border p-0', i === 0 && 'sticky z-10', i === 0 && (on ? 'bg-muted' : 'bg-background'))}
                        style={i === 0 ? { left: NUM_W } : undefined}
                      >
                        {choices ? (
                          <ChoiceCell readOnly={readOnly} label={label} value={(l[c.key] as string) ?? ''} choices={choices} onChange={(v) => setLine(l.id, { [c.key]: v })} />
                        ) : c.kind === 'text' ? (
                          <input aria-label={label} readOnly={readOnly} className={cellClass} value={(l[c.key] as string) ?? ''} onChange={(e) => setLine(l.id, { [c.key]: e.target.value })} />
                        ) : (
                          <NumberCell
                            label={label}
                            step={c.kind === 'rate' ? '0.00001' : 'any'}
                            value={l[c.key] as number | null}
                            empty={empty}
                            readOnly={readOnly}
                            onChange={(v) => setLine(l.id, { [c.key]: c.kind === 'rate' ? v ?? 0 : v })}
                          />
                        )}
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 border-b border-border bg-background p-0">
                    {/* An empty row has nothing to copy or remove. */}
                    <div className={cn('flex h-7 items-center justify-center gap-0.5', (empty || readOnly) && 'invisible')}>
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Duplicate this line" aria-label={`Duplicate line ${r + 1}`} onClick={() => duplicate([l])} data-testid="flexo-duplicate-line">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600" title="Remove this line" aria-label={`Remove line ${r + 1}`} onClick={() => remove([l.id])} data-testid="flexo-remove-line">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
