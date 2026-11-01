import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import type { Catalog, CatalogAssets, SaveRecord } from '@shared/contract'
import { isOutfitSave } from '@features/outfits/state/outfit-save'
import { useSaves } from '@features/saves/hooks/use-saves'
import { cn } from '@ui/cn'
import type { CatalogEntry } from '../types'
import {
  createSaleCatalogIndex,
  defaultLabelName,
  detachSaleItem,
  entrySaleItem,
  isClothingSubject,
  mergeSaleGroup,
  moveSaleItemAfter,
  outfitSaleItem,
  outfitSaleKey,
  outfitSourceFromSave,
  outfitSubjectFromSource,
  saleItemsFromRecord,
  saleRecordItems,
  splitSaleGroup,
  type SaleItemState,
  type SaleLabel,
  type SaleLabelPart,
  type SaleRecord,
  type SaleSize,
  type SaleTemplate,
} from './model'
import { OutfitSavesPicker } from './outfit-saves-picker'
import { readSaleRecords, writeSaleRecords } from './records'
import { renderSaleSheet } from './render'
import { SaleItemRow } from './sale-item-row'
import { useSaleArts } from './use-sale-arts'

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

export function SaleEditor({
  entries,
  allEntries,
  catalog,
  assets,
  initialSaves = [],
  onRemoveEntry,
  onClose,
}: {
  entries: CatalogEntry[]
  allEntries: CatalogEntry[]
  catalog: Catalog
  assets: CatalogAssets
  /** 从存档页「卖货图」直接带进来的搭配。 */
  initialSaves?: SaveRecord[]
  /** 移除图鉴单品时同步图鉴页的勾选状态。 */
  onRemoveEntry?: (key: string) => void
  onClose: () => void
}): React.ReactElement {
  const catalogIndex = React.useMemo(() => createSaleCatalogIndex(catalog.items), [catalog.items])
  const entriesByKey = React.useMemo(
    () => new Map(allEntries.map((entry) => [entry.key, entry])),
    [allEntries],
  )
  const createInitialItems = React.useCallback((): SaleItemState[] => {
    const next: SaleItemState[] = entries.map(entrySaleItem)
    const seen = new Set(next.map((item) => item.key))
    for (const save of initialSaves) {
      const source = outfitSourceFromSave(save)
      if (!source || seen.has(outfitSaleKey(source.saveId))) continue
      const subject = outfitSubjectFromSource(source, catalogIndex)
      if (!subject) continue
      seen.add(subject.key)
      next.push(outfitSaleItem(subject))
    }
    return next
  }, [catalogIndex, entries, initialSaves])

  const [items, setItems] = React.useState<SaleItemState[]>(createInitialItems)
  const allClothing = items.length > 0 && items.every((item) => isClothingSubject(item.subject))
  const [template, setTemplate] = React.useState<SaleTemplate>(allClothing ? 1 : 2)
  const [size, setSize] = React.useState<SaleSize>('dual')
  const [front, setFront] = React.useState(true)
  const [back, setBack] = React.useState(true)
  const [columns, setColumns] = React.useState(5)
  const [customRows, setCustomRows] = React.useState(false)
  const [rowPattern, setRowPattern] = React.useState('5')
  const [gap, setGap] = React.useState(16)
  const [groupGap, setGroupGap] = React.useState(4)
  const [showNames, setShowNames] = React.useState(true)
  const [dragKey, setDragKey] = React.useState<string | null>(null)
  const [armedKey, setArmedKey] = React.useState<string | null>(null)
  const dragHoverRef = React.useRef<{ key: string; startedAt: number } | null>(null)
  const armTimerRef = React.useRef<number | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [renderError, setRenderError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [records, setRecords] = React.useState<SaleRecord[]>(readSaleRecords)

  const { saves } = useSaves()
  const outfitSaves = React.useMemo(() => saves.filter(isOutfitSave), [saves])
  const addedKeys = React.useMemo(() => new Set(items.map((item) => item.key)), [items])

  const subjects = React.useMemo(() => items.map((item) => item.subject), [items])
  const { arts, error: artError } = useSaleArts({ subjects, catalog, assets, template })
  const error = artError ?? renderError

  const showSmallViews = template === 1 && size !== 'large'
  const rowCounts = React.useMemo(() => {
    if (!customRows) return undefined
    const values = rowPattern
      .split(/[，,\s]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    if (values.length === 0) return undefined
    const counts: number[] = []
    let remaining = items.length
    let index = 0
    while (remaining > 0) {
      const count = Math.min(values[index] ?? values[values.length - 1] ?? 1, remaining)
      counts.push(count)
      remaining -= count
      index += 1
    }
    return counts
  }, [customRows, items.length, rowPattern])

  const groupIds = [...new Set(items.map((item) => item.group))]
  const groupBlocks = groupIds.map((groupId) => ({
    groupId,
    items: items.filter((item) => item.group === groupId),
  }))
  const isArtReady = items.length > 0 && items.every((item) => arts[item.key] !== undefined)

  React.useEffect(() => {
    setTemplate(allClothing ? 1 : 2)
  }, [allClothing])

  React.useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (items.length === 0) {
      setPreview(null)
      setBusy(false)
      return
    }
    if (!isArtReady) {
      // 立绘还在重算：清掉旧预览，避免切换模版/增删条目时短暂显示上一张图。
      setPreview(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setBusy(true)
      const renderItems = items.map((item) => ({
        key: item.key,
        name: item.name,
        price: item.price,
        sold: item.sold,
        group: item.group,
        labels: item.subject.kind === 'outfit' ? item.labels : undefined,
        art: arts[item.key] ?? {},
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
        items: renderItems,
      })
        .then((url) => {
          if (cancelled) return
          setPreview(url)
          setRenderError(null)
        })
        .catch((caught: unknown) => {
          if (!cancelled) setRenderError(caught instanceof Error ? caught.message : String(caught))
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
    front,
    gap,
    groupGap,
    isArtReady,
    items,
    rowCounts,
    showNames,
    size,
    template,
  ])

  const resetDrag = React.useCallback((): void => {
    setDragKey(null)
    setArmedKey(null)
    dragHoverRef.current = null
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
  }, [])

  const handleDragStart = (key: string, event: React.DragEvent<HTMLDivElement>): void => {
    setDragKey(key)
    setArmedKey(null)
    dragHoverRef.current = null
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (key: string, event: React.DragEvent<HTMLDivElement>): void => {
    if (!dragKey || dragKey === key) return
    event.preventDefault()
    const current = dragHoverRef.current
    if (current?.key !== key) {
      dragHoverRef.current = { key, startedAt: Date.now() }
      setArmedKey(null)
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current)
      armTimerRef.current = window.setTimeout(() => {
        setArmedKey(key)
      }, 1000)
    }
  }

  const handleDrop = (key: string): void => {
    if (dragKey && dragKey !== key) {
      const shouldGroup = armedKey === key
      setItems((current) => {
        const next = shouldGroup ? mergeSaleGroup(current, dragKey, key) : current
        return moveSaleItemAfter(next, dragKey, key)
      })
    }
    resetDrag()
  }

  const updateItem = (key: string, update: (item: SaleItemState) => SaleItemState): void => {
    setItems((current) => current.map((item) => (item.key === key ? update(item) : item)))
  }

  const removeItem = (key: string): void => {
    const item = items.find((entry) => entry.key === key)
    if (item?.subject.kind === 'entry') onRemoveEntry?.(key)
    setItems((current) => current.filter((entry) => entry.key !== key))
  }

  const toggleItemLabel = (key: string, part: SaleLabelPart): void => {
    updateItem(key, (item) => {
      if (item.subject.kind !== 'outfit') return item
      if (item.labels.some((label) => label.part === part)) {
        return { ...item, labels: item.labels.filter((label) => label.part !== part) }
      }
      return {
        ...item,
        labels: [...item.labels, { part, name: defaultLabelName(item.subject, part), price: '' }],
      }
    })
  }

  const changeItemLabel = (
    key: string,
    part: SaleLabelPart,
    patch: Partial<Pick<SaleLabel, 'name' | 'price'>>,
  ): void => {
    updateItem(key, (item) => ({
      ...item,
      labels: item.labels.map((label) => (label.part === part ? { ...label, ...patch } : label)),
    }))
  }

  const toggleOutfitSave = (save: SaveRecord): void => {
    const source = outfitSourceFromSave(save)
    if (!source) return
    const subject = outfitSubjectFromSource(source, catalogIndex)
    if (!subject) {
      setNotice('这个搭配存档里的部件在当前图鉴中找不到，无法生成卖货图。')
      return
    }
    setItems((current) =>
      current.some((item) => item.key === subject.key)
        ? current.filter((item) => item.key !== subject.key)
        : [...current, outfitSaleItem(subject)],
    )
    setNotice(null)
  }

  const saveRecord = (): void => {
    if (!preview) return
    const now = Date.now()
    const record: SaleRecord = {
      id: String(now),
      createdAt: now,
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
      order: items.map((item) => item.key),
      groups: Object.fromEntries(items.map((item) => [item.key, item.group])),
      items: saleRecordItems(items),
      preview,
    }
    const next = [record, ...records.filter((item) => item.id !== record.id)].slice(0, 8)
    setRecords(next)
    writeSaleRecords(next)
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
    const loaded = saleItemsFromRecord(record, entriesByKey, catalogIndex)
    if (loaded.length === 0) {
      setNotice('记录中的商品已不在当前图鉴中')
      return
    }
    setItems(loaded)
    setTemplate(record.template)
    setSize(record.size)
    setFront(record.front)
    setBack(record.back)
    setColumns(record.columns)
    setCustomRows(Boolean(record.customRows))
    setRowPattern(record.rowPattern || String(record.columns))
    setGap(record.gap)
    setGroupGap(record.groupGap)
    setShowNames(Boolean(record.showNames))
    setRenderError(null)
    setNotice(null)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch bg-[var(--pkt-backdrop)] p-4">
      <div className="mx-auto flex h-full w-full max-w-[1240px] flex-col overflow-hidden rounded-xl border border-pkt-border bg-surface shadow-[var(--pkt-shadow-lg)]">
        <header className="flex shrink-0 items-center gap-2 border-b border-pkt-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-pkt-text">卖货图</h2>
            <p className="text-[10px] text-pkt-text-mute">
              {items.length} 件商品 · 价格和已卖出状态会保存在本机记录
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
                  isDisabled={!allClothing}
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
            {!allClothing ? (
              <p className="text-[9px] text-pkt-text-mute">
                服装模版仅支持全部勾选服饰或整套搭配。
              </p>
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
              <label className="flex items-center gap-1" title="搭配存档的部件名称始终显示">
                <input
                  type="checkbox"
                  checked={showNames}
                  onChange={(event) => setShowNames(event.target.checked)}
                  className="size-3 accent-[var(--pkt-accent)]"
                />
                显示单品名称
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
              {items.length === 0 ? (
                <p className="py-3 text-[10px] text-pkt-text-mute">
                  先在图鉴里勾选商品，或从下方「搭配存档」加入一套。
                </p>
              ) : (
                groupBlocks.map((block, blockIndex) => {
                  if (block.items.length === 1) {
                    const item = block.items[0]!
                    return (
                      <React.Fragment key={block.groupId}>
                        <SaleItemRow
                          item={item}
                          bordered
                          armed={armedKey === item.key}
                          grouped={false}
                          onDragStart={(event) => handleDragStart(item.key, event)}
                          onDragEnd={resetDrag}
                          onDragOver={(event) => handleDragOver(item.key, event)}
                          onDrop={(event) => {
                            event.preventDefault()
                            handleDrop(item.key)
                          }}
                          onChangeName={(value) =>
                            updateItem(item.key, (current) => ({ ...current, name: value }))
                          }
                          onChangePrice={(value) =>
                            updateItem(item.key, (current) => ({ ...current, price: value }))
                          }
                          onToggleSold={() =>
                            updateItem(item.key, (current) => ({
                              ...current,
                              sold: !current.sold,
                            }))
                          }
                          onToggleLabel={(part) => toggleItemLabel(item.key, part)}
                          onChangeLabel={(part, patch) => changeItemLabel(item.key, part, patch)}
                          onDetach={() => setItems((current) => detachSaleItem(current, item.key))}
                          onRemove={() => removeItem(item.key)}
                        />
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
                          组合 {blockIndex + 1} · {block.items.length} 件
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-[9px] text-pkt-text-mute hover:text-pkt-accent"
                          onClick={() =>
                            setItems((current) => splitSaleGroup(current, block.groupId))
                          }
                        >
                          拆开组合
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        {block.items.map((item) => (
                          <SaleItemRow
                            key={item.key}
                            item={item}
                            bordered={false}
                            armed={armedKey === item.key}
                            grouped
                            onDragStart={(event) => handleDragStart(item.key, event)}
                            onDragEnd={resetDrag}
                            onDragOver={(event) => handleDragOver(item.key, event)}
                            onDrop={(event) => {
                              event.preventDefault()
                              handleDrop(item.key)
                            }}
                            onChangeName={(value) =>
                              updateItem(item.key, (current) => ({ ...current, name: value }))
                            }
                            onChangePrice={(value) =>
                              updateItem(item.key, (current) => ({ ...current, price: value }))
                            }
                            onToggleSold={() =>
                              updateItem(item.key, (current) => ({
                                ...current,
                                sold: !current.sold,
                              }))
                            }
                            onToggleLabel={(part) => toggleItemLabel(item.key, part)}
                            onChangeLabel={(part, patch) => changeItemLabel(item.key, part, patch)}
                            onDetach={() =>
                              setItems((current) => detachSaleItem(current, item.key))
                            }
                            onRemove={() => removeItem(item.key)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <OutfitSavesPicker
              saves={outfitSaves}
              addedKeys={addedKeys}
              onToggle={toggleOutfitSave}
            />

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
              ) : items.length === 0 ? (
                <span className="text-[10px] text-pkt-text-mute">
                  勾选商品或添加搭配存档后生成预览
                </span>
              ) : (
                <SpinnerRoot size="sm" color="accent" />
              )}
            </div>
            {error ? (
              <p className="mt-2 text-[10px] text-pkt-danger">{error}</p>
            ) : notice ? (
              <p className="mt-2 text-[10px] text-pkt-warn">{notice}</p>
            ) : null}
            <div className="mt-3 flex items-center justify-end gap-2">
              <ButtonRoot size="sm" variant="outline" isDisabled={!preview} onPress={saveRecord}>
                保存记录
              </ButtonRoot>
              <ButtonRoot
                size="sm"
                isDisabled={!preview || busy || !isArtReady}
                onPress={() => void exportPng()}
              >
                导出 PNG
              </ButtonRoot>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
