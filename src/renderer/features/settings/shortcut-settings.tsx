import * as React from 'react'
import { ButtonRoot } from '@heroui/react'

import { cn } from '@ui/cn'
import {
  SHORTCUT_SCOPES,
  formatBinding,
  normalizeKey,
  resolveBindings,
  useShortcutStore,
  type Binding,
} from '@ui/shortcut-config'

/**
 * 快捷键设置：按页面（scope）分组，点「录制」后按下新组合键即可。
 *
 * - `Esc` 取消录制，`Backspace/Delete` 清除绑定
 * - 与同页面其它动作冲突时给出提示，但仍允许保存（后按的生效）
 */
export function ShortcutSettings({ platform }: { platform?: string }): React.ReactElement {
  const overrides = useShortcutStore((state) => state.overrides)
  const setBinding = useShortcutStore((state) => state.setBinding)
  const resetScope = useShortcutStore((state) => state.resetScope)
  const resetAll = useShortcutStore((state) => state.resetAll)
  const [recording, setRecording] = React.useState<{ scope: string; action: string } | null>(null)

  React.useEffect(() => {
    if (!recording) return
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(null)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setBinding(recording.scope, recording.action, null)
        setRecording(null)
        return
      }
      // 单按修饰键不算
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) return

      const binding: Binding = {
        key: normalizeKey(event),
        ...(event.metaKey || event.ctrlKey ? { mod: true } : {}),
        ...(event.shiftKey ? { shift: true } : {}),
        ...(event.altKey ? { alt: true } : {}),
      }
      setBinding(recording.scope, recording.action, binding)
      setRecording(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, setBinding])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-pkt-text-mute">
          点「录制」后按下新的组合键；Esc 取消，Backspace 清除该动作的快捷键。
        </p>
        <ButtonRoot size="sm" variant="ghost" onPress={resetAll}>
          全部恢复默认
        </ButtonRoot>
      </div>

      {SHORTCUT_SCOPES.map((scope) => {
        const bindings = resolveBindings(scope.id, overrides)
        return (
          <div key={scope.id} className="rounded-pkt border border-pkt-border">
            <div className="flex items-center justify-between border-b border-pkt-border px-2 py-1.5">
              <p className="text-xs font-medium">{scope.label}</p>
              <ButtonRoot size="sm" variant="ghost" onPress={() => resetScope(scope.id)}>
                恢复本节默认
              </ButtonRoot>
            </div>
            <div className="divide-y divide-pkt-border/60">
              {scope.actions.map((action) => {
                const binding = bindings[action.id] ?? null
                const isRecording = recording?.scope === scope.id && recording.action === action.id
                const conflict =
                  binding !== null &&
                  scope.actions.some(
                    (other) =>
                      other.id !== action.id &&
                      bindings[other.id] !== null &&
                      sameBinding(bindings[other.id]!, binding),
                  )

                return (
                  <div
                    key={action.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-pkt-text">{action.label}</p>
                      {conflict ? (
                        <p className="text-[10px] text-pkt-warn">与本节其它快捷键重复</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRecording(isRecording ? null : { scope: scope.id, action: action.id })
                      }
                      className={cn(
                        'shrink-0 rounded-pkt border px-2 py-1 text-[11px]',
                        isRecording
                          ? 'border-pkt-accent bg-pkt-accent/15 text-pkt-text'
                          : 'border-pkt-border text-pkt-text-dim hover:border-pkt-border-strong hover:text-pkt-text',
                      )}
                    >
                      {isRecording ? '按下新快捷键…' : formatBinding(binding, platform)}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function sameBinding(a: Binding, b: Binding): boolean {
  return (
    a.key === b.key &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  )
}
