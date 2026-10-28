import {
  ButtonRoot,
  InputRoot,
  ModalBackdrop,
  ModalBody,
  ModalCloseTrigger,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  ModalRoot,
} from '@heroui/react'
import * as React from 'react'

import type { CatalogItem, OutfitSaveData, SaveRecord } from '@shared/contract'
import { parseSaveBundle, serializeSaveBundle } from '@shared/saves'
import { FloatingWindow, useFloatingStore } from '@ui/floating'
import { useSaveShortcut } from '@ui/shortcuts'
import { toBase64 } from '@/services/assets'
import type { UseActorPreviewResult } from '../hooks/use-actor-preview'
import { SAVE_SHORTCUT } from '../shortcuts'
import { PART_ORDER, useOutfitStore } from '../state/outfit-store'
import { outfitItemCount } from '../state/outfit-save'
import { Section } from './section'

export const OUTFIT_SLOTS_WINDOW_ID = 'outfit-slots'

/** 存档二级菜单：列表、载入、保存、导入导出。 */
export function SlotsWindow({
  preview,
  slots,
  onSaveSlot,
  onDeleteSlot,
  onLoadSlot,
}: {
  preview: UseActorPreviewResult
  slots: SaveRecord[]
  onSaveSlot: (save: SaveRecord) => Promise<void>
  onDeleteSlot: (id: string) => Promise<void>
  onLoadSlot: (save: SaveRecord) => void
}): React.ReactElement {
  const worn = useOutfitStore((state) => state.worn)
  const sex = useOutfitStore((state) => state.sex)
  const faceCode = useOutfitStore((state) => state.faceCode)
  const openWindow = useFloatingStore((state) => state.openWindow)

  const [saveOpen, setSaveOpen] = React.useState(false)
  const [slotName, setSlotName] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const wornItems = React.useMemo(
    () => PART_ORDER.map((part) => worn[part]).filter((item): item is CatalogItem => Boolean(item)),
    [worn],
  )

  useSaveShortcut(() => {
    openWindow(OUTFIT_SLOTS_WINDOW_ID)
    if (wornItems.length > 0) setSaveOpen(true)
  })

  const onSave = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const dataUrl = await preview.exportArrangementPng('large', 1)
      if (!dataUrl) return
      const now = Date.now()
      const record: SaveRecord = {
        version: 2,
        id: `${now}`,
        kind: 'outfit',
        name: slotName.trim() || `搭配 ${slots.length + 1}`,
        createdAt: now,
        updatedAt: now,
        preview: dataUrl,
        data: {
          sex,
          faceCode,
          worn: Object.fromEntries(wornItems.map((item) => [item.part, item.code])),
        } satisfies OutfitSaveData,
      }
      await onSaveSlot(record)
      setSaveOpen(false)
      setSlotName('')
    } catch (error) {
      console.error('[outfits] 保存搭配失败', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <FloatingWindow
      id={OUTFIT_SLOTS_WINDOW_ID}
      title="存档"
      width={400}
      defaultPosition={{ x: 260, y: 110 }}
    >
      <div className="flex flex-col gap-2 p-2.5">
        <Section title="保存">
          <ButtonRoot
            className="w-full"
            size="sm"
            isDisabled={wornItems.length === 0 || saving}
            onPress={() => setSaveOpen(true)}
          >
            <span>{saving ? '保存中…' : '保存当前搭配'}</span>
            <span className="text-[9px] opacity-60">{SAVE_SHORTCUT}</span>
          </ButtonRoot>
        </Section>

        <Section
          title="已存搭配"
          count={slots.length}
          actions={<SlotActions slots={slots} onImport={onSaveSlot} />}
        >
          {slots.length === 0 ? (
            <p className="rounded-pkt border border-dashed border-pkt-border/80 px-3 py-5 text-center text-[11px] text-pkt-text-mute">
              还没有存档。搭配好后点「保存当前搭配」，或在列表里导入 JSON。
            </p>
          ) : (
            <div className="pkt-scroll flex max-h-[56vh] flex-col gap-1 overflow-y-auto pr-0.5">
              <p className="pb-0.5 text-[10px] text-pkt-text-mute">
                点击任意存档，在右侧预览区复原
              </p>
              {slots.map((slot) => (
                <div key={slot.id} className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => onLoadSlot(slot)}
                    title={slot.name}
                    className="flex w-full items-center gap-2 rounded-pkt border border-pkt-border/70 p-1.5 pr-9 text-left transition-colors hover:border-pkt-accent hover:bg-pkt-panel-hover"
                  >
                    <img
                      src={slot.preview}
                      alt=""
                      className="pkt-pixelated h-[54px] w-9 shrink-0 rounded-sm border border-pkt-border/60"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-pkt-text">{slot.name}</span>
                      <span className="mt-0.5 block text-[10px] text-pkt-text-mute">
                        {formatDate(slot.updatedAt || slot.createdAt)} · {outfitItemCount(slot)} 件
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="删除存档"
                    onClick={() => void onDeleteSlot(slot.id)}
                    className="absolute right-2 grid size-5 place-items-center rounded-full text-[12px] text-pkt-text-mute opacity-0 transition-opacity group-hover:opacity-100 hover:bg-pkt-danger/20 hover:text-pkt-danger"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <ModalRoot
        isOpen={saveOpen}
        onOpenChange={(open) => {
          if (!open && !saving) setSaveOpen(false)
        }}
      >
        <ModalBackdrop>
          <ModalContainer placement="center">
            <ModalDialog>
              <ModalHeader>
                <ModalHeading className="text-base">保存搭配</ModalHeading>
                <ModalCloseTrigger />
              </ModalHeader>
              <ModalBody>
                <InputRoot
                  autoFocus
                  value={slotName}
                  placeholder={`搭配 ${slots.length + 1}`}
                  onChange={(event) => setSlotName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void onSave()
                  }}
                />
              </ModalBody>
              <ModalFooter className="justify-end gap-2">
                <ButtonRoot variant="ghost" onPress={() => setSaveOpen(false)} isDisabled={saving}>
                  取消
                </ButtonRoot>
                <ButtonRoot onPress={() => void onSave()} isDisabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </ButtonRoot>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </ModalRoot>
    </FloatingWindow>
  )
}

/** 存档导入/导出：单个 JSON 文件，方便分享搭配。 */
function SlotActions({
  slots,
  onImport,
}: {
  slots: SaveRecord[]
  onImport: (save: SaveRecord) => Promise<void>
}): React.ReactElement {
  const onExport = async (): Promise<void> => {
    const payload = serializeSaveBundle(slots)
    await window.pkt.saveFile({
      suggestedName: `pktgf-saves-${Date.now()}.json`,
      dataBase64: toBase64(new TextEncoder().encode(payload)),
    })
  }

  const onPick = async (): Promise<void> => {
    const file = await window.pkt.openFile({
      filters: [{ name: '存档', extensions: ['json'] }],
    })
    if (!file) return
    try {
      const raw = new TextDecoder().decode(
        Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0)),
      )
      const list = parseSaveBundle(raw)
      for (const save of list) await onImport(save)
    } catch (error) {
      console.warn('[saves] 导入失败', error)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <ButtonRoot
        size="sm"
        variant="tertiary"
        onPress={() => void onExport()}
        isDisabled={slots.length === 0}
      >
        导出
      </ButtonRoot>
      <ButtonRoot size="sm" variant="tertiary" onPress={() => void onPick()}>
        导入
      </ButtonRoot>
    </div>
  )
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
