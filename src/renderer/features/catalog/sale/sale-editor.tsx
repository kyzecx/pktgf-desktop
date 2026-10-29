import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import type { CatalogAssets } from '@shared/contract'
import { cn } from '@ui/cn'
import type { CatalogEntry } from '../types'
import { loadSaleArt, type SaleArt } from './art'
import { renderSaleSheet, type SaleRenderItem, type SaleSize, type SaleTemplate } from './render'

interface SaleRecord {
  id: string
  createdAt: number
  template: SaleTemplate
  size: SaleSize
  front: boolean
  back: boolean
  columns: number
  customRows: boolean
  rowPattern: string
  gap: number
  groupGap: number
  showNames: boolean
  order: string[]
  groups: Record<string, string>
  items: Array<{ key: string; name: string; price: string; sold: boolean }>
  preview: string
}

const STORAGE_KEY = 'pkt-sale-records'
const GROUP_COLORS = [
  { border: 'border-pkt-accent/60', bg: 'bg-pkt-accent/5', text: 'text-pkt-accent' },
  { border: 'border-pkt-warn/60', bg: 'bg-pkt-warn/5', text: 'text-pkt-warn' },
  { border: 'border-pkt-danger/50', bg: 'bg-pkt-danger/5', text: 'text-pkt-danger' },
  {
    border: 'border-pkt-border-strong',
    bg: 'bg-pkt-panel-hover',
    text: 'text-pkt-text-dim',
  },
]

function readRecords(): SaleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as SaleRecord[]).slice(0, 8) : []
  } catch {
    return []
  }
}

function writeRecords(records: SaleRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 8)))
  } catch {
    /* 记录预览过大时只保留当前会话 */
  }
}

export function SaleEditor({
  entries,
  allEntries,
  assets,
  onClose,
}: {
  entries: CatalogEntry[]
  allEntries: CatalogEntry[]
  assets: CatalogAssets
  onClose: () => void
}): React.ReactElement {
  const [currentEntries, setCurrentEntries] = React.useState(entries)
  const [template, setTemplate] = React.useState<SaleTemplate>(
    entries.every((entry) => entry.kind === 'outfit') ? 1 : 2,
  )
  const [size, setSize] = React.useState<SaleSize>('dual')
  const [front, setFront] = React.useState(true)
  const [back, setBack] = React.useState(true)
  const [columns, setColumns] = React.useState(5)
  const [customRows, setCustomRows] = React.useState(false)
  const [rowPattern, setRowPattern] = React.useState('5')
  const [gap, setGap] = React.useState(16)
  const [groupGap, setGroupGap] = React.useState(4)
  const [showNames, setShowNames] = React.useState(false)
  const [prices, setPrices] = React.useState<Record<string, string>>({})
  const [names, setNames] = React.useState<Record<string, string>>({})
  const [order, setOrder] = React.useState<string[]>(entries.map((entry) => entry.key))
  const [groups, setGroups] = React.useState<Record<string, string>>(
    Object.fromEntries(entries.map((entry) => [entry.key, entry.key])),
  )
  const [dragKey, setDragKey] = React.useState<string | null>(null)
  const [armedKey, setArmedKey] = React.useState<string | null>(null)
  const dragHoverRef = React.useRef<{ key: string; startedAt: number } | null>(null)
  const armTimerRef = React.useRef<number | null>(null)
  const [sold, setSold] = React.useState<Set<string>>(new Set())
  const [arts, setArts] = React.useState<Record<string, SaleArt>>({})
  const [preview, setPreview] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [records, setRecords] = React.useState<SaleRecord[]>(readRecords)

  const allOutfit =
    currentEntries.length > 0 && currentEntries.every((entry) => entry.kind === 'outfit')
  const showSmallViews = template === 1 && size !== 'large'
  const orderedEntries = React.useMemo(
    () =>
      order
        .map((key) => currentEntries.find((entry) => entry.key === key))
        .filter((entry): entry is CatalogEntry => Boolean(entry)),
    [currentEntries, order],
  )
  const rowCounts = React.useMemo(() => {
    if (!customRows) return undefined
    const values = rowPattern
      .split(/[，,\s]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (values.length === 0) return undefined
    const counts: number[] = []
    let remaining = orderedEntries.length
    let index = 0
    while (remaining > 0) {
      const count = Math.min(values[index] ?? values[values.length - 1] ?? 1, remaining)
      counts.push(count)
      remaining -= count
      index += 1
    }
    return counts
  }, [customRows, orderedEntries.length, rowPattern])

  const groupIds = [...new Set(orderedEntries.map((entry) => groups[entry.key] ?? entry.key))]
  const groupBlocks = groupIds
    .map((groupId) => ({
      groupId,
      entries: orderedEntries.filter((entry) => (groups[entry.key] ?? entry.key) === groupId),
    }))
    .filter((block) => block.entries.length > 0)

  React.useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    setTemplate(allOutfit ? 1 : 2)
  }, [allOutfit])

  React.useEffect(() => {
    let cancelled = false
    setArts({})
    setPreview(null)
    setError(null)
    if (currentEntries.length === 0) return

    void (async () => {
      try {
        const pairs = await Promise.all(
          currentEntries.map(
            async (entry) => [entry.key, await loadSaleArt(entry, assets, template)] as const,
          ),
        )
        if (!cancelled) setArts(Object.fromEntries(pairs))
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [assets, currentEntries, template])

  React.useEffect(() => {
    if (currentEntries.length === 0) {
      setPreview(null)
      return
    }
    if (Object.keys(arts).length < currentEntries.length) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setBusy(true)
      const items: SaleRenderItem[] = orderedEntries.map((entry) => ({
        key: entry.key,
        name: names[entry.key] ?? entry.name,
        price: prices[entry.key] ?? '',
        sold: sold.has(entry.key),
        group: groups[entry.key] ?? entry.key,
        art: arts[entry.key] ?? {},
      }))
      void renderSaleSheet({
        template,
        size,
        front,
        back,
        columns,
        rowCounts,
        gap,
        groupGap,
        showNames,
        items,
      })
        .then((url) => {
          if (cancelled) return
          setPreview(url)
          setError(null)
        })
        .catch((caught: unknown) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
        })
        .finally(() => {
          if (!cancelled) setBusy(false)
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    arts,
    back,
    columns,
    currentEntries,
    front,
    gap,
    groupGap,
    groups,
    names,
    orderedEntries,
    prices,
    rowCounts,
    showNames,
    size,
    sold,
    template,
  ])

  const setPrice = (key: string, value: string): void => {
    setPrices((current) => ({ ...current, [key]: value }))
  }

  const toggleSold = (key: string): void => {
    setSold((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const saveRecord = (): void => {
    if (!preview) return
    const record: SaleRecord = {
      id: String(Date.now()),
      createdAt: Date.now(),
      template,
      size,
      front,
      back,
      columns,
      customRows,
      rowPattern,
      gap,
      groupGap,
      showNames,
      order,
      groups,
      items: orderedEntries.map((entry) => ({
        key: entry.key,
        name: names[entry.key] ?? entry.name,
        price: prices[entry.key] ?? '',
        sold: sold.has(entry.key),
      })),
      preview,
    }
    const next = [record, ...records.filter((entry) => entry.id !== record.id)].slice(0, 8)
    setRecords(next)
    writeRecords(next)
  }

  const exportPng = async (): Promise<void> => {
    if (!preview) return
    const saved = await window.pkt.saveFile({
      useExportDir: true,
      suggestedName: `卖货图-${Date.now()}.png`,
      dataBase64: preview.slice(preview.indexOf(',') + 1),
    })
    if (saved.saved) saveRecord()
  }

  const loadRecord = (record: SaleRecord): void => {
    const loaded = record.items
      .map((item) => allEntries.find((entry) => entry.key === item.key))
      .filter((entry): entry is CatalogEntry => Boolean(entry))
    if (loaded.length === 0) {
      setError('记录中的商品已不在当前图鉴中')
      return
    }
    setCurrentEntries(loaded)
    setTemplate(record.template)
    setSize(record.size)
    setFront(record.front)
    setBack(record.back)
    setColumns(record.columns)
    setCustomRows(Boolean(record.customRows))
    setRowPattern(record.rowPattern ?? String(record.columns))
    setGap(record.gap ?? 16)
    setGroupGap(record.groupGap ?? 4)
    setShowNames(Boolean(record.showNames))
    setOrder(record.order ?? loaded.map((entry) => entry.key))
    setGroups(record.groups ?? Object.fromEntries(loaded.map((entry) => [entry.key, entry.key])))
    setNames(Object.fromEntries(record.items.map((item) => [item.key, item.name ?? item.key])))
    setPrices(Object.fromEntries(record.items.map((item) => [item.key, item.price])))
    setSold(new Set(record.items.filter((item) => item.sold).map((item) => item.key)))
    setError(null)
  }

  const renderSaleRow = (
    entry: CatalogEntry,
    bordered = false,
    onDetach?: () => void,
  ): React.ReactElement => (
    <div
      draggable
      onDragStart={(event) => {
        setDragKey(entry.key)
        setArmedKey(null)
        dragHoverRef.current = null
        if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => {
        setDragKey(null)
        setArmedKey(null)
        dragHoverRef.current = null
        if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
      }}
      onDragOver={(event) => {
        if (!dragKey || dragKey === entry.key) return
        event.preventDefault()
        const current = dragHoverRef.current
        if (current?.key !== entry.key) {
          dragHoverRef.current = { key: entry.key, startedAt: Date.now() }
          setArmedKey(null)
          if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
          armTimerRef.current = window.setTimeout(() => {
            setArmedKey(entry.key)
          }, 1000)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (!dragKey || dragKey === entry.key) return
        const shouldGroup = armedKey === entry.key
        if (shouldGroup) {
          const targetGroup = groups[entry.key] ?? entry.key
          setGroups((current) => {
            const from = current[dragKey] ?? dragKey
            const next = { ...current }
            for (const [key, group] of Object.entries(current)) {
              if (group === from) next[key] = targetGroup
            }
            next[dragKey] = targetGroup
            return next
          })
        }
        setOrder((current) => {
          const next = current.filter((key) => key !== dragKey)
          const target = next.indexOf(entry.key)
          next.splice(target + 1, 0, dragKey)
          return next
        })
        setDragKey(null)
        setArmedKey(null)
        dragHoverRef.current = null
        if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
      }}
      className={cn(
        'flex flex-col gap-1 rounded-pkt p-1.5 transition-all duration-200',
        bordered
          ? 'border border-pkt-border/60'
          : 'border border-transparent hover:border-pkt-border/60',
        armedKey === entry.key && 'ring-2 ring-pkt-accent ring-offset-1 ring-offset-surface',
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className="cursor-grab select-none text-[10px] text-pkt-text-mute"
          title="拖动到另一条可组合"
        >
          ⋮⋮
        </span>
        <input
          value={names[entry.key] ?? entry.name}
          onChange={(event) =>
            setNames((current) => ({ ...current, [entry.key]: event.target.value }))
          }
          aria-label={`${entry.name} 展示名称`}
          className="h-7 min-w-0 flex-1 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
        />
        {onDetach ? (
          <button
            type="button"
            className="shrink-0 text-[9px] text-pkt-text-mute hover:text-pkt-accent"
            onClick={onDetach}
          >
            拆出
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[9px] text-pkt-text-mute">{entry.code}</span>
        <input
          value={prices[entry.key] ?? ''}
          onChange={(event) => setPrice(entry.key, event.target.value)}
          placeholder="价格"
          className="h-7 w-16 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
        />
        <label className="flex items-center gap-1 text-[9px] text-pkt-text-mute">
          <input
            type="checkbox"
            checked={sold.has(entry.key)}
            onChange={() => toggleSold(entry.key)}
            className="size-3 accent-[var(--pkt-accent)]"
          />
          已卖
        </label>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch bg-[var(--pkt-backdrop)] p-4">
      <div className="mx-auto flex h-full w-full max-w-[1240px] flex-col overflow-hidden rounded-xl border border-pkt-border bg-surface shadow-[var(--pkt-shadow-lg)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-pkt-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-pkt-text">卖货图</h2>
            <p className="text-[10px] text-pkt-text-mute">
              {currentEntries.length} 件商品 · 价格和已卖出状态会保存在本机记录
            </p>
          </div>
          <ButtonRoot className="ml-auto" size="sm" variant="ghost" onPress={onClose}>
            关闭
          </ButtonRoot>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="pkt-scroll flex w-[370px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-pkt-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-pkt-text-mute">模版</span>
              <div className="flex items-center gap-1">
                <ButtonRoot
                  size="sm"
                  variant={template === 1 ? 'primary' : 'ghost'}
                  isDisabled={!allOutfit}
                  onPress={() => setTemplate(1)}
                >
                  服装模版
                </ButtonRoot>
                <ButtonRoot
                  size="sm"
                  variant={template === 2 ? 'primary' : 'ghost'}
                  onPress={() => setTemplate(2)}
                >
                  道具模版
                </ButtonRoot>
              </div>
            </div>
            {!allOutfit ? (
              <p className="text-[9px] text-pkt-text-mute">服装模版仅支持全部勾选服饰。</p>
            ) : null}

            {template === 1 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-pkt-text-mute">展示大小</span>
                  <div className="flex items-center gap-1">
                    {(['large', 'small', 'dual'] as const).map((value) => (
                      <ButtonRoot
                        key={value}
                        size="sm"
                        variant={size === value ? 'primary' : 'ghost'}
                        onPress={() => setSize(value)}
                      >
                        {value === 'large' ? '大图' : value === 'small' ? '小图' : '双图'}
                      </ButtonRoot>
                    ))}
                  </div>
                </div>
                {showSmallViews ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-pkt-text-mute">小图视角</span>
                    <div className="flex items-center gap-1">
                      <ButtonRoot
                        size="sm"
                        variant={front ? 'primary' : 'ghost'}
                        isDisabled={front && !back}
                        onPress={() => setFront((value) => !value)}
                      >
                        正面
                      </ButtonRoot>
                      <ButtonRoot
                        size="sm"
                        variant={back ? 'primary' : 'ghost'}
                        isDisabled={back && !front}
                        onPress={() => setBack((value) => !value)}
                      >
                        背面
                      </ButtonRoot>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-pkt-text-mute">每行数量</span>
                <select
                  value={columns}
                  onChange={(event) => setColumns(Number(event.target.value))}
                  className="h-7 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
                >
                  {[3, 4, 5, 6, 7, 8].map((value) => (
                    <option key={value} value={value}>
                      {value} 个
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-pkt-border/60 pt-3 text-[10px] text-pkt-text-mute">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={customRows}
                  onChange={(event) => {
                    setCustomRows(event.target.checked)
                    if (event.target.checked && !rowPattern.trim()) {
                      setRowPattern(String(columns))
                    }
                  }}
                  className="size-3 accent-[var(--pkt-accent)]"
                />
                自定义每行
              </label>
              {customRows ? (
                <input
                  value={rowPattern}
                  onChange={(event) => setRowPattern(event.target.value)}
                  placeholder="例如 5,4,3"
                  aria-label="每行数量序列"
                  className="h-6 min-w-24 rounded border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
                />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-pkt-border/60 pt-3 text-[10px] text-pkt-text-mute">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={showNames}
                  onChange={(event) => setShowNames(event.target.checked)}
                  className="size-3 accent-[var(--pkt-accent)]"
                />
                显示名字
              </label>
              <label className="flex items-center gap-1">
                间距
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={gap}
                  onChange={(event) => setGap(Math.max(0, Number(event.target.value) || 0))}
                  className="h-6 w-16 rounded border border-pkt-border bg-pkt-panel px-1 text-pkt-text"
                />
              </label>
              <label className="flex items-center gap-1">
                组合间距
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={groupGap}
                  onChange={(event) => setGroupGap(Math.max(0, Number(event.target.value) || 0))}
                  className="h-6 w-16 rounded border border-pkt-border bg-pkt-panel px-1 text-pkt-text"
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-pkt-border/60 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-pkt-text-mute">名称 / 价格 / 已卖出</span>
                <span className="text-[9px] text-pkt-text-mute">拖动条目可组合</span>
              </div>
              {orderedEntries.length === 0 ? (
                <p className="py-3 text-[10px] text-pkt-text-mute">先在图鉴里勾选商品。</p>
              ) : (
                groupBlocks.map((block, blockIndex) => {
                  if (block.entries.length === 1) {
                    return (
                      <React.Fragment key={block.groupId}>
                        {renderSaleRow(block.entries[0]!, true)}
                      </React.Fragment>
                    )
                  }
                  const color = GROUP_COLORS[blockIndex % GROUP_COLORS.length]!
                  return (
                    <div
                      key={block.groupId}
                      className={cn(
                        'pkt-fade-in flex flex-col gap-1 rounded-pkt border p-1.5',
                        color.border,
                        color.bg,
                      )}
                    >
                      <div
                        className={cn('flex items-center gap-1.5 px-0.5 text-[9px]', color.text)}
                      >
                        <span className="relative grid size-3 place-items-center">
                          <span className="absolute inline-flex size-2 animate-pulse rounded-full bg-current opacity-50" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
                        </span>
                        <span>
                          组合 {blockIndex + 1} · {block.entries.length} 件
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-[9px] text-pkt-text-mute hover:text-pkt-accent"
                          onClick={() => {
                            setGroups((current) => {
                              const next = { ...current }
                              for (const member of block.entries) next[member.key] = member.key
                              return next
                            })
                          }}
                        >
                          拆开组合
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        {block.entries.map((entry) => (
                          <React.Fragment key={entry.key}>
                            {renderSaleRow(entry, false, () =>
                              setGroups((current) => ({
                                ...current,
                                [entry.key]: entry.key,
                              })),
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-pkt-border/60 pt-3">
              <span className="text-[11px] text-pkt-text-mute">已保存卖货图</span>
              {records.length === 0 ? (
                <p className="text-[10px] text-pkt-text-mute">还没有保存过卖货图。</p>
              ) : (
                records.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => loadRecord(record)}
                    className="flex items-center gap-2 rounded-pkt border border-pkt-border/60 p-1.5 text-left hover:border-pkt-accent/60"
                  >
                    <img
                      src={record.preview}
                      alt=""
                      className="pkt-pixelated h-9 w-9 rounded-sm border border-pkt-border/50 object-contain"
                    />
                    <span className="min-w-0 flex-1 truncate text-[10px] text-pkt-text">
                      {new Date(record.createdAt).toLocaleString('zh-CN')} · {record.items.length}{' '}
                      件
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col p-3">
            <div className="pkt-checker relative grid min-h-0 flex-1 place-items-center overflow-auto rounded-pkt border border-pkt-border/60 p-3">
              {preview ? (
                <img
                  src={preview}
                  alt="卖货图预览"
                  className="pkt-pixelated max-h-full max-w-full object-contain"
                />
              ) : busy ? (
                <SpinnerRoot size="sm" color="accent" />
              ) : (
                <span className="text-[10px] text-pkt-text-mute">
                  {currentEntries.length === 0 ? '勾选商品后生成预览' : '等待生成预览…'}
                </span>
              )}
            </div>
            {error ? <p className="mt-2 text-[10px] text-pkt-danger">{error}</p> : null}
            <div className="mt-3 flex items-center justify-end gap-2">
              <ButtonRoot size="sm" variant="outline" isDisabled={!preview} onPress={saveRecord}>
                保存记录
              </ButtonRoot>
              <ButtonRoot size="sm" isDisabled={!preview || busy} onPress={() => void exportPng()}>
                导出 PNG
              </ButtonRoot>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
