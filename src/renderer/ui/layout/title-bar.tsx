import * as React from 'react'

import { cn } from '../cn'
import { ButtonRoot } from '@heroui/react'

/**
 * 无边框窗口的标题栏。
 *
 * macOS 用原生红绿灯（titleBarStyle: hiddenInset），保留左侧安全区；
 * Windows / Linux 自绘最小化 / 最大化 / 关闭。
 */
export function TitleBar({
  platform,
  title,
  children,
}: {
  platform: string
  title: React.ReactNode
  children?: React.ReactNode
}): React.ReactElement {
  const isMac = platform === 'darwin'

  return (
    <header
      className="pkt-drag relative flex h-[var(--pkt-titlebar-h)] shrink-0 items-center border-b border-pkt-border bg-pkt-bg-elev/90"
      style={{ paddingLeft: isMac ? 82 : 12 }}
    >
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <span className="truncate text-[12px] font-semibold tracking-wide text-pkt-text-dim">
          {title}
        </span>
      </div>

      <div className="pkt-no-drag ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 pr-2">
        {children}
      </div>

      {isMac ? null : (
        <div className="pkt-no-drag flex h-full items-stretch">
          <WindowButton label="最小化" onClick={() => window.pkt.windowMinimize()}>
            <rect x="4" y="7.5" width="8" height="1" />
          </WindowButton>
          <WindowButton label="最大化" onClick={() => window.pkt.windowToggleMaximize()}>
            <rect
              x="4.5"
              y="4.5"
              width="7"
              height="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </WindowButton>
          <WindowButton label="关闭" danger onClick={() => window.pkt.windowClose()}>
            <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </WindowButton>
        </div>
      )}
    </header>
  )
}

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <ButtonRoot
      aria-label={label}
      onPress={onClick}
      isIconOnly
      variant="ghost"
      className={cn('h-full w-11 rounded-none', danger && 'hover:bg-danger hover:text-white')}
    >
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        {children}
      </svg>
    </ButtonRoot>
  )
}
