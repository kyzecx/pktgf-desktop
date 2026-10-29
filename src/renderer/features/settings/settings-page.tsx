import * as React from 'react'

import type { AppInfo, CacheStats, ResourceVersionStatus } from '@shared/contract'
import { ButtonRoot, CardRoot, SpinnerRoot } from '@heroui/react'
import { formatSlotTime } from '@ui/format'
import { ExportSettings } from './export-settings'
import { ShortcutSettings } from './shortcut-settings'
import { ChangelogList } from '@ui/whats-new'

export function SettingsPage({
  info,
  version,
}: {
  info: AppInfo | null
  version: ResourceVersionStatus | null
}): React.ReactElement {
  const [stats, setStats] = React.useState<CacheStats | null>(null)
  const [busy, setBusy] = React.useState<'clear' | 'check' | 'rebuild' | null>(null)
  const [checkResult, setCheckResult] = React.useState<ResourceVersionStatus | null>(version)
  const [updateNote, setUpdateNote] = React.useState<string | null>(null)
  const [stage, setStage] = React.useState<string | null>(null)

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
      setStage('检查中…')
      const result = await window.pkt.checkResourceVersion()
      setCheckResult(result)
      setUpdateNote(describeUpdate(result))
      setStage(null)
      if (result.applied) void refreshStats()
    } finally {
      setBusy(null)
    }
  }

  /** 强制重建：不看版本，直接重拉官方配置 */
  const rebuild = async (): Promise<void> => {
    setBusy('rebuild')
    setStage('开始重建目录…')
    try {
      const result = await window.pkt.rebuildCatalog()
      setCheckResult(result)
      setUpdateNote(describeUpdate(result))
      if (result.applied) void refreshStats()
    } finally {
      setStage(null)
      setBusy(null)
    }
  }

  // 后台自动检查发现更新 → 同步显示（目录已由主进程刷新）
  React.useEffect(() => {
    const offUpdate = window.pkt.onResourceUpdated((status) => {
      setCheckResult(status)
      setUpdateNote(describeUpdate(status))
      setStage(null)
    })
    const offProgress = window.pkt.onResourceProgress((progress) => setStage(progress.stage))
    return () => {
      offUpdate()
      offProgress()
    }
  }, [])

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
              <Row label="自动检查">
                <span>每 5 分钟</span>
              </Row>
              {stage ? (
                <Row label="进行中">
                  <span className="text-pkt-warn">{stage}</span>
                </Row>
              ) : null}
              {updateNote ? (
                <Row label="更新结果">
                  <span className="text-pkt-accent">{updateNote}</span>
                </Row>
              ) : null}
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
                  variant="outline"
                  onPress={rebuild}
                  isDisabled={busy !== null}
                >
                  {busy === 'rebuild' ? '重建中…' : '立即重建目录'}
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

        <CardRoot variant="secondary">
          <div className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-sm font-medium">更新日志</h2>
              <p className="text-[11px] text-pkt-text-mute">
                每个版本做了什么；资源自动更新不走发版，见上一张卡片。
              </p>
            </div>
            <ChangelogList />
          </div>
        </CardRoot>

        <CardRoot variant="secondary">
          <div className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-sm font-medium">导出</h2>
              <p className="text-[11px] text-pkt-text-mute">
                统一设置保存位置，省掉每次导出都要选文件夹。
              </p>
            </div>
            <ExportSettings />
          </div>
        </CardRoot>

        <CardRoot variant="secondary">
          <div className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-sm font-medium">快捷键</h2>
              <p className="text-[11px] text-pkt-text-mute">
                每个页面单独设置；改动立即生效并保存在本机。
              </p>
            </div>
            <ShortcutSettings platform={info?.platform} />
          </div>
        </CardRoot>
      </div>
    </div>
  )
}

/** 把一次检查结果翻译成人话。 */
function describeUpdate(status: ResourceVersionStatus): string {
  if (status.error) return `自动更新失败：${status.error}`
  if (status.rebuilt) return '已重建目录（新家具 / 房型 / 部位现在就能用）'
  if (status.applied) return `已更新 ${status.patched ?? 0} 条资源指向`
  if (!status.upToDate && status.mainScript) return '官方有新版本，重建后仍是同一份目录'
  return '已是最新'
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
