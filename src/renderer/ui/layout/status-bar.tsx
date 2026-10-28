import * as React from 'react'

import { cn } from '../cn'

export function StatusBar({
  left,
  right,
  className,
}: {
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <footer
      className={cn(
        'flex h-[var(--pkt-statusbar-h)] shrink-0 items-center justify-between gap-3 border-t border-pkt-border bg-pkt-bg-elev/80 px-3 text-[11px] text-pkt-text-mute',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3 [&>*]:truncate">{left}</div>
      <div className="flex shrink-0 items-center gap-3">{right}</div>
    </footer>
  )
}

export function AppShell({
  titleBar,
  rail,
  children,
  statusBar,
}: {
  titleBar: React.ReactNode
  rail: React.ReactNode
  children: React.ReactNode
  statusBar: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col bg-pkt-bg">
      {titleBar}
      <div className="flex min-h-0 flex-1">
        {rail}
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
      {statusBar}
    </div>
  )
}
