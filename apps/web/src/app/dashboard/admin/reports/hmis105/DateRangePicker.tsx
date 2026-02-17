'use client'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface DateRangePickerProps {
  startYear: number
  startMonth: number
  endYear: number
  endMonth: number
  onStartChange: (year: number, month: number) => void
  onEndChange: (year: number, month: number) => void
}

export function DateRangePicker({
  startYear,
  startMonth,
  endYear,
  endMonth,
  onStartChange,
  onEndChange,
}: DateRangePickerProps) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  function applyPreset(monthsBack: number) {
    // End = previous month
    const end = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const start = new Date(end.getFullYear(), end.getMonth() - (monthsBack - 1), 1)
    onStartChange(start.getFullYear(), start.getMonth() + 1)
    onEndChange(end.getFullYear(), end.getMonth() + 1)
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Date Range</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => applyPreset(1)}
          className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors"
        >
          Last month
        </button>
        <button
          type="button"
          onClick={() => applyPreset(3)}
          className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors"
        >
          3 months
        </button>
        <button
          type="button"
          onClick={() => applyPreset(6)}
          className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors"
        >
          6 months
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <select
            value={startMonth}
            onChange={(e) => onStartChange(startYear, Number(e.target.value))}
            className="block w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={startYear}
            onChange={(e) => onStartChange(Number(e.target.value), startMonth)}
            className="block w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">to</span>
        <div className="flex gap-1.5">
          <select
            value={endMonth}
            onChange={(e) => onEndChange(endYear, Number(e.target.value))}
            className="block w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={endYear}
            onChange={(e) => onEndChange(Number(e.target.value), endMonth)}
            className="block w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
