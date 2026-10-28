import { IconSearch, InputRoot, KbdRoot } from '@heroui/react'
import * as React from 'react'

import type { CatalogItem, Part } from '@shared/contract'
import { cn } from '@ui/cn'
import { useThumbnail } from '../hooks/use-thumbnail'
import { PART_LABELS, PART_ORDER } from '../state/outfit-store'

const RESULT_LIMIT = 24

/**
 * 空格唤起的全局搜索。
 *
 * 搜索范围是全部部位（按性别过滤），选中的物品直接穿戴并关闭弹层。
 * 输入框获得焦点时不再拦截空格，保证能正常输入带空格的名称。
 */
export function SearchPalette({
  items,
  sex,
  worn,
  onPick,
}: {
  items: CatalogItem[]
  sex: 1 | 2
  worn: Partial<Record<Part, CatalogItem>>
  onPick: (item: CatalogItem) => void
}): React.ReactElement | null {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const activeRef = React.useRef<HTMLButtonElement | null>(null)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.code !== 'Space' && event.key !== ' ') return
      if (isTypingTarget(event.target)) return
      // 捕获阶段拦截：避免当前聚焦的按钮把同一个空格当成激活操作。
      event.preventDefault()
      event.stopPropagation()
      setQuery('')
      setActiveIndex(0)
      setOpen(true)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const pool = React.useMemo(
    () => items.filter((item) => item.sex === 0 || item.sex === sex),
    [items, sex],
  )

  const results = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return []
    return pool
      .filter(
        (item) =>
          item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword),
      )
      .sort(
        (a, b) =>
          PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) ||
          a.serial - b.serial ||
          a.sex - b.sex,
      )
      .slice(0, RESULT_LIMIT)
  }, [pool, query])

  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, results.length])

  if (!open) return null

  const close = (): void => {
    setOpen(false)
    setQuery('')
  }

  const pick = (item: CatalogItem): void => {
    onPick(item)
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
      return
    }
    if (event.key === 'Enter') {
      const item = results[activeIndex]
      if (!item) return
      event.preventDefault()
      pick(item)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 px-6 pt-[13vh] backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索服饰"
        className="pkt-no-drag pkt-fade-in flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border/80 bg-surface/95 shadow-[0_28px_70px_-18px_rgba(0,0,0,0.8)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-pkt-border/70 px-3 py-2.5">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-pkt-text-mute" />
            <InputRoot
              autoFocus
              value={query}
              placeholder="搜索全部部位：名称或编号"
              className="w-full pl-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <KbdRoot className="shrink-0 text-[10px]">Esc</KbdRoot>
        </div>

        {query.trim() === '' ? (
          <div className="px-6 py-10 text-center">
            <p className="text-xs text-pkt-text-dim">
              输入关键词，搜索全部 {pool.length.toLocaleString()} 件服饰
            </p>
            <p className="mt-1.5 text-[10px] text-pkt-text-mute">
              支持名称和编号，例如「短发」「f_hair001」
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-pkt-text-mute">
            没有匹配「{query.trim()}」的物品
          </div>
        ) : (
          <div className="pkt-scroll max-h-[46vh] overflow-y-auto p-1.5">
            {results.map((item, index) => {
              const isActive = index === activeIndex
              return (
                <SearchResultRow
                  key={`${item.code}:${item.type}`}
                  item={item}
                  active={isActive}
                  worn={worn[item.part]?.code === item.code}
                  rowRef={isActive ? activeRef : null}
                  onHover={() => setActiveIndex(index)}
                  onPick={() => pick(item)}
                />
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-pkt-border/70 px-3 py-1.5 text-[10px] text-pkt-text-mute">
          <span>↑↓ 选择 · Enter 穿戴 · Esc 关闭</span>
          <span>{results.length > 0 ? `${results.length} 条结果` : ''}</span>
        </div>
      </div>
    </div>
  )
}

function SearchResultRow({
  item,
  active,
  worn,
  rowRef,
  onHover,
  onPick,
}: {
  item: CatalogItem
  active: boolean
  worn: boolean
  rowRef: React.RefObject<HTMLButtonElement | null> | null
  onHover: () => void
  onPick: () => void
}): React.ReactElement {
  const thumbnail = useThumbnail(item, 'large')

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onPick}
      onMouseEnter={onHover}
      className={cn(
        'flex w-full items-center gap-2 rounded-pkt px-2 py-1.5 text-left transition-colors',
        active ? 'bg-pkt-accent/15' : 'hover:bg-pkt-panel-hover',
      )}
    >
      <span className="grid h-12 w-8 shrink-0 place-items-center overflow-hidden rounded-pkt border border-pkt-border/70 bg-pkt-panel/60">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            draggable={false}
            className="pkt-pixelated h-12 w-8 object-contain"
          />
        ) : (
          <span className="size-3 animate-pulse rounded-sm bg-pkt-panel-active" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[12px] text-pkt-text">{item.name}</span>
          {worn ? <span className="shrink-0 text-[9px] text-pkt-accent">已穿戴</span> : null}
        </span>
        <span className="block truncate text-[10px] text-pkt-text-mute">
          {PART_LABELS[item.part]} · {item.code}
        </span>
      </span>
      <span className="shrink-0 text-[10px] text-pkt-text-mute">
        {item.sex === 0 ? '通用' : item.sex === 1 ? '男' : '女'}
      </span>
    </button>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  if (element.isContentEditable) return true
  return (
    element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
  )
}
