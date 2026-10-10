/**
 * Filter a list by coordinator with one click - a button for each CRM user,
 * and "Unknown" for every name the Excel file uses for people with no login
 * here, taken together.
 *
 * Every button carries how many rows it holds; hovering shows the amount.
 */

import { OWNER_ALL, OWNER_NOT_IN_CRM, type OwnerOption } from '@/lib/owner';
import { cn, formatCurrency } from '@/lib/utils';

interface OwnerFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: OwnerOption[];
  /** "invoice" / "account": what one row is, for the counts. */
  rowNoun: string;
  className?: string;
}

/** Rows and money under every name the Excel file uses that has no login here. */
function unknownTotals(options: OwnerOption[]) {
  const outside = options.filter((o) => !o.inCrm);
  return {
    outside,
    rows: outside.reduce((sum, o) => sum + o.rows, 0),
    amount: outside.reduce((sum, o) => sum + Math.round(o.amount * 100), 0) / 100,
  };
}

function Chip({
  label,
  rows,
  amount,
  noun,
  active,
  unknown,
  onClick,
  testId,
}: {
  label: string;
  rows: number;
  amount: number;
  noun: string;
  active: boolean;
  unknown?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      title={`${rows.toLocaleString('en-IN')} ${rows === 1 ? noun : `${noun}s`} · ${formatCurrency(amount)}`}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? unknown
            ? 'border-amber-500 bg-amber-500 text-white'
            : 'border-primary bg-primary text-primary-foreground'
          : unknown
            ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400'
            : 'border-border bg-background/60 text-foreground hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-[11px] font-medium tabular-nums',
          active ? 'bg-white/20' : 'bg-muted text-muted-foreground'
        )}
      >
        {rows.toLocaleString('en-IN')}
      </span>
    </button>
  );
}

/**
 * One click to filter: "All", a button per CRM coordinator, and "Unknown" for
 * every name the file uses that has no login here. Clicking the selected
 * button again goes back to All.
 */
export function OwnerFilter({ value, onChange, options, rowNoun, className }: OwnerFilterProps) {
  const inCrm = options.filter((o) => o.inCrm);
  const unknown = unknownTotals(options);
  const everyone = {
    rows: options.reduce((sum, o) => sum + o.rows, 0),
    amount: options.reduce((sum, o) => sum + Math.round(o.amount * 100), 0) / 100,
  };
  const toggle = (key: string) => onChange(value === key ? OWNER_ALL : key);

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Filter by coordinator"
      data-testid="owner-filter"
    >
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Coordinator</span>
      <Chip
        label="All"
        rows={everyone.rows}
        amount={everyone.amount}
        noun={rowNoun}
        active={value === OWNER_ALL}
        onClick={() => onChange(OWNER_ALL)}
        testId="owner-all"
      />
      {inCrm.map((o) => (
        <Chip
          key={o.key}
          label={o.name}
          rows={o.rows}
          amount={o.amount}
          noun={rowNoun}
          active={value === o.key}
          onClick={() => toggle(o.key)}
          testId="owner-chip"
        />
      ))}
      {unknown.outside.length > 0 && (
        <Chip
          label="Unknown"
          rows={unknown.rows}
          amount={unknown.amount}
          noun={rowNoun}
          active={value === OWNER_NOT_IN_CRM}
          unknown
          onClick={() => toggle(OWNER_NOT_IN_CRM)}
          testId="owner-unknown"
        />
      )}
    </div>
  );
}

/** An Owner's display props, without its `key` (which React would take for its own). */
export function ownerNameProps(owner: { name: string; inCrm: boolean }) {
  return { name: owner.name, inCrm: owner.inCrm };
}

/** The owner cell of a table row: the name, and a tag when it has no login here. */
export function OwnerName({ name, inCrm }: { name: string; inCrm: boolean }) {
  return (
    <div>
      <div className={inCrm ? undefined : 'font-medium text-amber-700 dark:text-amber-400'}>{name}</div>
      {!inCrm && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Not in CRM</div>}
    </div>
  );
}
