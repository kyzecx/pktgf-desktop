import * as React from 'react'

import { cn } from '../cn'

export interface NavItem {
  key: string
  label: string
  icon: React.ReactNode
  disabled?: boolean
  badge?: string
}

export function NavRail({
  items,
  bottomItems,
  active,
  onSelect,
}: {
  items: NavItem[]
  bottomItems?: NavItem[]
  active: string
  onSelect: (key: string) => void
}): React.ReactElement {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-pkt-border bg-pkt-bg-elev/60 py-2">
      {items.map((item) => (
        <NavRailButton
          key={item.key}
          item={item}
          active={item.key === active}
          onSelect={onSelect}
        />
      ))}

      {bottomItems && bottomItems.length > 0 ? (
        <div className="mt-auto flex flex-col items-center gap-1 pt-2">
          {bottomItems.map((item) => (
            <NavRailButton
              key={item.key}
              item={item}
              active={item.key === active}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </nav>
  )
}

function NavRailButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: (key: string) => void
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={item.disabled}
      title={item.label}
      onClick={() => onSelect(item.key)}
      className={cn(
        'pkt-no-drag group relative flex w-14 flex-col items-center gap-1 rounded-pkt py-2 transition-colors',
        active
          ? 'bg-pkt-panel-active text-pkt-text'
          : 'text-pkt-text-mute hover:bg-pkt-panel hover:text-pkt-text-dim',
        item.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
    >
      <span className="grid size-6 place-items-center">{item.icon}</span>
      <span className="text-[10px] leading-none">{item.label}</span>
      {active ? (
        <span className="absolute top-1/2 -left-2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-pkt-accent" />
      ) : null}
      {item.badge ? (
        <span className="absolute top-1 right-1 rounded-sm bg-pkt-accent px-1 text-[9px] leading-3 text-pkt-accent-text">
          {item.badge}
        </span>
      ) : null}
    </button>
  )
}
