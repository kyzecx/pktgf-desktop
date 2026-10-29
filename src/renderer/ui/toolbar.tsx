import { ChipLabel, ChipRoot, IconSearch, InputRoot, KbdRoot } from '@heroui/react'
import * as React from 'react'

import { cn } from './cn'
import type { RecentItem } from './recent-items'

/** 工具页统一顶栏：搜索框固定在最左侧，筛选/切换紧随其后，操作区靠右。 */
export function ToolbarRoot({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div
      className={cn(
        'relative flex h-11 shrink-0 items-center gap-2 border-b border-pkt-border px-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 搜索框固定在顶栏正中；左右两侧的控制按页面排列。 */
export function ToolbarSearch({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
      {children}
    </div>
  )
}

/** 第二行分类/筛选栏；图鉴、搭配、存档使用同一高度与内边距。 */
export function ToolbarSubbar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex min-h-10 shrink-0 flex-nowrap items-center gap-1 border-b border-pkt-border/60 px-3 py-1.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return <div className={cn('flex items-center gap-1', className)}>{children}</div>
}

export function ToolbarActions({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('ml-auto flex flex-wrap items-center gap-1', className)}>{children}</div>
  )
}

export function ToolbarCount({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <ChipRoot size="sm" variant="soft">
      <ChipLabel>{children}</ChipLabel>
    </ChipRoot>
  )
}

export interface ToolbarOption {
  value: string
  label: string
}

export function ToolbarSelect({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: string | number
  options: readonly ToolbarOption[]
  ariaLabel: string
  onChange: (value: string) => void
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className="h-7 shrink-0 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/** 所有工具页共用的搜索框；固定居中，历史记录以图片条目展示。 */
export function SearchField({
  value,
  placeholder,
  inputRef,
  history = [],
  onPickHistory,
  onClearHistory,
  scope,
  onChange,
}: {
  value: string
  placeholder: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  history?: RecentItem[]
  onPickHistory?: (item: RecentItem) => void
  onClearHistory?: () => void
  /** 限定搜索范围开关：显示在输入框内右侧的「全」按钮。 */
  scope?: { active: boolean; onToggle: () => void }
  onChange: (value: string) => void
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  // 只有「用户主动点进输入框」才展开历史；程序化 focus（比如空格打开面板）不弹
  const userOpened = React.useRef(false)

  return (
    <div className="relative w-64 shrink-0">
      <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-pkt-text-mute" />
      <InputRoot
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onPointerDown={() => {
          userOpened.current = true
        }}
        onKeyDownCapture={() => {
          userOpened.current = true
        }}
        onFocus={() => {
          if (userOpened.current) setOpen(true)
        }}
        onBlur={() => {
          userOpened.current = false
          window.setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        onChange={(event) => onChange(event.target.value)}
        className={scope ? 'w-full pr-20 pl-9' : 'w-full pr-11 pl-9'}
      />
      {scope ? (
        <button
          type="button"
          aria-pressed={scope.active}
          aria-label={scope.active ? '搜索全部服饰' : '仅搜索当前分类'}
          title={scope.active ? '关闭全部分类搜索' : '搜索全部分类'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={scope.onToggle}
          className={
            scope.active
              ? 'absolute top-1/2 right-1.5 z-10 grid size-5 -translate-y-1/2 place-items-center rounded bg-pkt-accent text-[9px] text-pkt-accent-text'
              : 'absolute top-1/2 right-1.5 z-10 grid size-5 -translate-y-1/2 place-items-center rounded border border-pkt-border text-[9px] text-pkt-text-mute'
          }
        >
          全
        </button>
      ) : null}
      <KbdRoot
        className={
          scope
            ? 'pointer-events-none absolute top-1/2 right-8 z-10 -translate-y-1/2 text-[9px]'
            : 'pointer-events-none absolute top-1/2 right-2 z-10 -translate-y-1/2 text-[9px]'
        }
      >
        空格
      </KbdRoot>

      {open && history.length > 0 ? (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-pkt border border-pkt-border bg-pkt-panel p-1"
          style={{ boxShadow: 'var(--pkt-shadow-lg)' }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[9px] text-pkt-text-mute">历史记录</span>
            <button
              type="button"
              className="text-[9px] text-pkt-accent hover:underline"
              onClick={() => {
                onClearHistory?.()
                setOpen(false)
              }}
            >
              清空
            </button>
          </div>
          <div className="pkt-scroll flex max-h-56 flex-col overflow-y-auto">
            {history.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onPickHistory?.(item)
                  setOpen(false)
                  inputRef?.current?.focus()
                }}
                className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-pkt-panel-hover"
              >
                <img
                  src={item.image}
                  alt=""
                  className="pkt-pixelated size-8 shrink-0 rounded-sm border border-pkt-border/60 object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-pkt-text">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
