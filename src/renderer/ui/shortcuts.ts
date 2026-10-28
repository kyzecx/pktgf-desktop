import * as React from 'react'

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  if (element.isContentEditable) return true
  return (
    element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
  )
}

/** 空格：未在输入时触发当前页搜索（搭配页打开全局搜索弹层）。 */
export function useSearchShortcut(open: () => void): void {
  const openRef = React.useRef(open)
  openRef.current = open

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.code !== 'Space' && event.key !== ' ') return
      if (isTypingTarget(event.target)) return
      // 捕获阶段拦截：避免当前聚焦的按钮把同一个空格当成激活操作。
      event.preventDefault()
      event.stopPropagation()
      openRef.current()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}

/** Cmd/Ctrl+S：由页面决定「保存」的具体动作。 */
export function useSaveShortcut(save: () => void, enabled = true): void {
  const saveRef = React.useRef(save)
  saveRef.current = save

  React.useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.altKey) return
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() !== 's') return
      event.preventDefault()
      saveRef.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
