import { ButtonRoot } from '@heroui/react'
import * as React from 'react'

import type {
  AppInfo,
  AppUpdateCheck,
  AppUpdateDownload,
  AppUpdateProgress,
} from '@shared/contract'

const REPO_URL = 'https://github.com/kyzecx/pktgf-desktop'

/** 工作台右栏：软件版本信息 + GitHub Release 更新。 */
export function UpdateCard({ info }: { info: AppInfo | null }): React.ReactElement {
  const [check, setCheck] = React.useState<AppUpdateCheck | null>(null)
  const [download, setDownload] = React.useState<AppUpdateDownload | null>(null)
  const [progress, setProgress] = React.useState<AppUpdateProgress | null>(null)
  const [busy, setBusy] = React.useState<'checking' | 'downloading' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const checkUpdate = async (): Promise<void> => {
    setBusy('checking')
    setError(null)
    setDownload(null)
    setProgress(null)
    try {
      const result = await window.pkt.checkAppUpdate()
      setCheck(result)
      if (result.error) setError(result.error)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(null)
    }
  }

  const downloadUpdate = async (): Promise<void> => {
    setBusy('downloading')
    setError(null)
    setDownload(null)
    setProgress(null)
    const unsubscribe = window.pkt.onAppUpdateProgress(setProgress)
    try {
      const result = await window.pkt.downloadAppUpdate()
      setDownload(result)
      if (result.error) setError(result.error)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      unsubscribe()
      setBusy(null)
    }
  }

  const hasDownload = Boolean(check?.available && check.assetName)
  const hasReleaseOnly = Boolean(check?.available && !check.assetName)
  const isDownloaded = Boolean(download?.downloaded)

  const action = (): void => {
    if (busy) return
    if (hasReleaseOnly && check) {
      void window.pkt.openExternal(check.releaseUrl)
      return
    }
    if (hasDownload && !isDownloaded) {
      void downloadUpdate()
      return
    }
    void checkUpdate()
  }

  const buttonLabel =
    busy === 'checking'
      ? '检查中…'
      : busy === 'downloading'
        ? '下载中…'
        : hasReleaseOnly
          ? '打开发布页'
          : hasDownload && !isDownloaded
            ? `下载 v${check?.latestVersion ?? ''}`
            : isDownloaded
              ? '重新检查'
              : '检查更新'

  const status = updateStatus({ check, download, progress, busy, error })

  return (
    <section className="rounded-xl border border-pkt-border/70 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-pkt-text">软件版本</h2>
        <span className="font-mono text-[11px] text-pkt-text">v{info?.appVersion ?? '—'}</span>
      </div>
      <p className="mt-1 text-[10px] text-pkt-text-mute">
        Electron {info?.electronVersion ?? '—'} · Chromium {info?.chromeVersion ?? '—'} ·{' '}
        {platformLabel(info?.platform)}
      </p>

      <div className="mt-2 flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-pkt-text-mute" title={status}>
          {status}
        </p>
        <ButtonRoot
          size="sm"
          variant={hasDownload && !isDownloaded ? 'primary' : 'tertiary'}
          isDisabled={busy !== null}
          onPress={action}
        >
          {buttonLabel}
        </ButtonRoot>
      </div>

      {busy === 'downloading' ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-pkt-panel-active">
          <div
            className="h-full rounded-full bg-pkt-accent transition-[width] duration-150"
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>
      ) : null}

      {check?.available && check.notes ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-[10px] leading-relaxed text-pkt-text-mute">
          {check.notes}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-3 text-[10px]">
        {check ? (
          <button
            type="button"
            onClick={() => void window.pkt.openExternal(check.releaseUrl)}
            className="text-pkt-accent hover:underline"
          >
            在 GitHub 查看 Release
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void window.pkt.openExternal(REPO_URL)}
          className="text-pkt-text-mute hover:text-pkt-text-dim"
        >
          GitHub 仓库
        </button>
      </div>
    </section>
  )
}

function updateStatus({
  check,
  download,
  progress,
  busy,
  error,
}: {
  check: AppUpdateCheck | null
  download: AppUpdateDownload | null
  progress: AppUpdateProgress | null
  busy: 'checking' | 'downloading' | null
  error: string | null
}): string {
  if (busy === 'checking') return '正在检查 GitHub Releases…'
  if (busy === 'downloading') {
    return progress && progress.percent > 0
      ? `正在下载安装包 ${progress.percent}%`
      : '正在下载安装包…'
  }
  if (download?.downloaded) return `已下载到 ${download.path ?? '下载目录'}`
  if (error) return error
  if (!check) return '从 GitHub Releases 检查新版本'
  if (check.available) {
    return check.assetName
      ? `发现新版本 v${check.latestVersion}，可下载本平台安装包`
      : `发现新版本 v${check.latestVersion}，但暂无本平台安装包`
  }
  if (!check.latestVersion) return 'GitHub 上暂无发布版本'
  return `已是最新版本 v${check.currentVersion}`
}

function platformLabel(platform: string | undefined): string {
  if (platform === 'darwin') return 'macOS'
  if (platform === 'win32') return 'Windows'
  if (platform === 'linux') return 'Linux'
  return platform ?? '未知系统'
}
