import * as React from 'react'
import { create } from 'zustand'

import { isTypingTarget } from './shortcuts'

/**
 * 可自定义的快捷键。
 *
 * 每个页面（scope）一组动作，绑定存 localStorage；设置页可以逐个录制。
 * 只处理「单键 / 组合键」，不支持序列（不需要）。
 */

export interface Binding {
  /** 主键，用 `KeyboardEvent.key` 的小写形式（' ' 记作 'space'） */
  key: string
  /** Cmd（mac）/ Ctrl */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ShortcutAction {
  id: string
  label: string
  /** 默认绑定；null 表示默认没有快捷键 */
  defaultBinding: Binding | null
}

export interface ShortcutScope {
  id: string
  label: string
  actions: ShortcutAction[]
}

const STORAGE_KEY = 'pkt-shortcuts'

/** 各页面的默认快捷键表。新增页面只往这里加一条。 */
export const SHORTCUT_SCOPES: ShortcutScope[] = [
  {
    id: 'room',
    label: '建造',
    actions: [
      { id: 'toggleAssets', label: '打开/关闭素材面板', defaultBinding: { key: 'space' } },
      { id: 'undo', label: '撤销', defaultBinding: { key: 'z', mod: true } },
      { id: 'redo', label: '重做', defaultBinding: { key: 'z', mod: true, shift: true } },
      { id: 'rotate', label: '旋转选中家具', defaultBinding: { key: 'r' } },
      { id: 'delete', label: '删除选中', defaultBinding: { key: 'delete' } },
      { id: 'grid', label: '显示/隐藏网格', defaultBinding: { key: 'g' } },
    ],
  },
  {
    id: 'outfits',
    label: '搭配',
    actions: [
      { id: 'search', label: '聚焦搜索', defaultBinding: { key: 'space' } },
      { id: 'save', label: '保存到存档', defaultBinding: { key: 's', mod: true } },
      { id: 'export', label: '导出 PNG', defaultBinding: { key: 'e', mod: true } },
      { id: 'exportGif', label: '导出 GIF', defaultBinding: { key: 'e', mod: true, shift: true } },
    ],
  },
  {
    id: 'catalog',
    label: '图鉴',
    actions: [
      { id: 'search', label: '聚焦搜索', defaultBinding: { key: 'space' } },
      { id: 'export', label: '导出当前', defaultBinding: { key: 'e', mod: true } },
    ],
  },
]

type Bindings = Record<string, Record<string, Binding | null>>

function readBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Bindings) : {}
  } catch {
    return {}
  }
}

interface ShortcutState {
  overrides: Bindings
  setBinding: (scope: string, action: string, binding: Binding | null) => void
  resetScope: (scope: string) => void
  resetAll: () => void
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  overrides: readBindings(),

  setBinding: (scope, action, binding) => {
    const next = { ...get().overrides, [scope]: { ...(get().overrides[scope] ?? {}) } }
    next[scope]![action] = binding
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    set({ overrides: next })
  },

  resetScope: (scope) => {
    const next = { ...get().overrides }
    delete next[scope]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    set({ overrides: next })
  },

  resetAll: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ overrides: {} })
  },
}))

/** 取某个页面实际的绑定（带用户覆盖）。 */
export function resolveBindings(
  scopeId: string,
  overrides: Bindings,
): Record<string, Binding | null> {
  const scope = SHORTCUT_SCOPES.find((entry) => entry.id === scopeId)
  const out: Record<string, Binding | null> = {}
  if (!scope) return out
  for (const action of scope.actions) {
    const override = overrides[scopeId]?.[action.id]
    out[action.id] = override === undefined ? action.defaultBinding : override
  }
  return out
}

/** 事件的 `key` 归一化：空格统一成 'space'。 */
export function normalizeKey(event: KeyboardEvent): string {
  if (event.code === 'Space' || event.key === ' ') return 'space'
  return event.key.toLowerCase()
}

export function matches(event: KeyboardEvent, binding: Binding | null): boolean {
  if (!binding) return false
  const mod = event.metaKey || event.ctrlKey
  if (Boolean(binding.mod) !== mod) return false
  if (Boolean(binding.shift) !== event.shiftKey) return false
  if (Boolean(binding.alt) !== event.altKey) return false
  return normalizeKey(event) === binding.key
}

/** 把绑定显示成 `⌘⇧Z` / `空格` 这类文案。 */
export function formatBinding(binding: Binding | null, platform?: string): string {
  if (!binding) return '未设置'
  if (binding.key === 'space') return '空格'
  const isMac =
    (platform ?? (typeof window !== 'undefined' ? window.pkt?.platform : '')) === 'darwin'
  const parts: string[] = []
  if (binding.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  if (binding.shift) parts.push(isMac ? '⇧' : 'Shift')
  if (binding.alt) parts.push(isMac ? '⌥' : 'Alt')
  parts.push(binding.key === 'delete' ? 'Del' : binding.key.toUpperCase())
  return parts.join(isMac ? '' : '+')
}

/**
 * 页面级快捷键：按 scope 读取（含用户覆盖），命中就调用对应回调。
 *
 * `handlers` 只需给关心的动作，其余忽略。
 */
export function useShortcuts(
  scope: string,
  handlers: Record<string, (() => void) | undefined>,
  options: { capture?: boolean } = {},
): void {
  const overrides = useShortcutStore((state) => state.overrides)
  const bindings = React.useMemo(() => resolveBindings(scope, overrides), [scope, overrides])

  const handlersRef = React.useRef(handlers)
  handlersRef.current = handlers

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      if (isTypingTarget(event.target)) return

      for (const [action, binding] of Object.entries(bindings)) {
        if (!binding) continue
        if (!matches(event, binding)) continue
        const handler = handlersRef.current[action]
        if (!handler) continue
        event.preventDefault()
        if (options.capture) event.stopPropagation()
        handler()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown, options.capture ? true : false)
    return () => window.removeEventListener('keydown', onKeyDown, options.capture ? true : false)
  }, [bindings, options.capture])
}
