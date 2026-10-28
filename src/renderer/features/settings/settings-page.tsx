import * as React from 'react'

import type { AppInfo, CacheStats, ResourceVersionStatus } from '@shared/contract'
import { ButtonRoot, CardRoot, SpinnerRoot } from '@heroui/react'
import { formatSlotTime } from '@ui/format'

export function SettingsPage({
  info,
  version,
}: {
  info: AppInfo | null
  version: ResourceVersionStatus | null
}): React.ReactElement {
  const [stats, setStats] = React.useState<CacheStats | null>(null)
  const [busy, setBusy] = React.useState<'clear' | 'check' | null>(null)
  const [checkResult, setCheckResult] = React.useState<ResourceVersionStatus | null>(version)

  const refreshStats = React.useCallback(async () => {
    setStats(await window.pkt.getCacheStats())
  }, [])

  React.useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  const clearCache = async (): Promise<void> => {
    setBusy('clear')
    try {
      await window.pkt.clearResourceCache()
      await refreshStats()
    } finally {
      setBusy(null)
    }
  }

  const recheck = async (): Promise<void> => {
    setBusy('check')
    try {
      setCheckResult(await window.pkt.checkResourceVersion())
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="pkt-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
        <CardRoot variant="secondary">
          <section>
            <div className="space-y-3 p-3 text-[12px]">
              <Row label="资源状态">
                <span
                  className={
                    !checkResult
                      ? 'text-pkt-text-mute'
                      : checkResult.error || !checkResult.upToDate
                        ? 'text-pkt-warn'
                        : 'text-pkt-accent'
                  }
                >
                  {!checkResult
                    ? '未检查'
                    : checkResult.error
                      ? '检查失败'
                      : checkResult.upToDate
                        ? '已是最新'
                        : '官方已更新'}
                </span>
              </Row>
              <Row label="上次检查">
                <span>{checkResult ? formatSlotTime(checkResult.checkedAt) : '—'}</span>
              </Row>
              <Row label="本地缓存">
                {stats ? (
                  <span>
                    {stats.files} 个文件 · {(stats.bytes / 1024 / 1024).toFixed(1)} MB
                  </span>
                ) : (
                  <SpinnerRoot size="sm" color="accent" />
                )}
              </Row>
              <div className="flex gap-2 pt-1">
                <ButtonRoot size="sm" onPress={recheck} isDisabled={busy !== null}>
                  {busy === 'check' ? '检查中…' : '检查更新'}
                </ButtonRoot>
                <ButtonRoot
                  size="sm"
                  variant="danger-soft"
                  onPress={clearCache}
                  isDisabled={busy !== null}
                >
                  {busy === 'clear' ? '清理中…' : '清空资源缓存'}
                </ButtonRoot>
                <ButtonRoot size="sm" variant="ghost" onPress={() => void window.pkt.openDataDir()}>
                  打开数据目录
                </ButtonRoot>
              </div>
            </div>
          </section>
        </CardRoot>

        <CardRoot variant="secondary">
          <section>
            <div className="space-y-2 p-3 text-[12px]">
              <Row label="版本">{info?.appVersion ?? '—'}</Row>
              <Row label="Electron">{info?.electronVersion ?? '—'}</Row>
              <Row label="Chromium">{info?.chromeVersion ?? '—'}</Row>
              <Row label="平台">{info?.platform ?? '—'}</Row>
              <div className="my-2 h-px w-full bg-border" />
              <p className="text-[11px] leading-relaxed text-pkt-text-mute">
                皮卡堂工坊为非官方工具。数据与素材版权归皮卡堂官方所有，
                本应用仅在本机做展示与合成，不提供任何资源分发。
              </p>
            </div>
          </section>
        </CardRoot>
      </div>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-pkt-text-mute">{label}</span>
      <span className="flex items-center gap-2 text-pkt-text-dim">{children}</span>
    </div>
  )
}
