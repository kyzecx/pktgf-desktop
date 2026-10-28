import * as React from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'pkt-theme'

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

/** 在 React 挂载前应用，避免先闪一下深色底。 */
export function applyInitialTheme(): void {
  applyTheme(readStoredTheme() ?? systemTheme())
}

/** 浅色/深色切换；有手选值时持久化，否则跟随系统默认。 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = React.useState<Theme>(() => readStoredTheme() ?? systemTheme())

  React.useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggle = React.useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* 隐私模式/存储不可用时仅影响下次启动 */
      }
      return next
    })
  }, [])

  return [theme, toggle]
}
