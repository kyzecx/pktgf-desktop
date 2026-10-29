import * as React from 'react'
import { ButtonRoot } from '@heroui/react'

import { CHANGELOG, CURRENT_VERSION, type ChangelogEntry } from '@shared/changelog'

/**
 * 版本更新公告 + 更新日志。
 *
 * - 升级后首次打开：弹一次「本次更新」（localStorage 记已读版本）
 * - 设置页：完整的更新日志列表
 */
const SEEN_KEY = 'pkt-seen-version'

export function WhatsNewGate(): React.ReactElement | null {
  const [entry, setEntry] = React.useState<ChangelogEntry | null>(null)

  React.useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) === CURRENT_VERSION) return
    } catch {
      // 隐私模式下读不到就每次都弹，不阻塞
    }
    setEntry(CHANGELOG[0] ?? null)
  }, [])

  const dismiss = (): void => {
    try {
      localStorage.setItem(SEEN_KEY, CURRENT_VERSION)
    } catch {
      /* 忽略 */
    }
    setEntry(null)
  }

  if (!entry) return null

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-6">
      <div className="flex max-h-[80vh] w-[min(560px,92vw)] flex-col overflow-hidden rounded-2xl border border-pkt-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-pkt-border px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-pkt-text">
              v{entry.version} · {entry.title}
            </h2>
            <p className="text-[10px] text-pkt-text-mute">{entry.date} 更新</p>
          </div>
          <span className="rounded-full border border-pkt-accent/40 bg-pkt-accent/10 px-2 py-0.5 text-[10px] text-pkt-accent">
            新版本
          </span>
        </div>

        <div className="pkt-scroll flex-1 overflow-y-auto px-4 py-3">
          <EntryList entry={entry} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-pkt-border px-4 py-3">
          <ButtonRoot
            size="sm"
            variant="ghost"
            onPress={() => void window.pkt.openExternal('https://github.com/kyzecx/pktgf-desktop')}
          >
            GitHub
          </ButtonRoot>
          <ButtonRoot size="sm" onPress={dismiss}>
            知道了
          </ButtonRoot>
        </div>
      </div>
    </div>
  )
}

/** 设置页的完整更新日志。 */
export function ChangelogList(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {CHANGELOG.map((entry) => (
        <section key={entry.version} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[13px] font-medium text-pkt-text">v{entry.version}</h3>
            <span className="text-[11px] text-pkt-text-dim">{entry.title}</span>
            <span className="text-[10px] text-pkt-text-mute">{entry.date}</span>
          </div>
          <EntryList entry={entry} />
        </section>
      ))}
    </div>
  )
}

function EntryList({ entry }: { entry: ChangelogEntry }): React.ReactElement {
  return (
    <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-pkt-text-dim">
      {entry.items.map((item) => (
        <li key={item.text} className="flex gap-1.5">
          <span className="mt-[3px] shrink-0 rounded-full border border-pkt-border px-1 text-[9px] text-pkt-text-mute">
            {item.group}
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  )
}
