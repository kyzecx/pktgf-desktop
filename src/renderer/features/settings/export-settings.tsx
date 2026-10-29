import * as React from 'react'
import { ButtonRoot, CheckboxRoot } from '@heroui/react'

import type { ExportPrefs } from '@shared/contract'

/**
 * 导出设置：固定保存目录 + 保存后自动打开所在文件夹。
 *
 * 没设目录时保持原来的「每次弹保存对话框」；设了之后所有导出
 * （PNG / GIF / 视频 / 存档 / 搭配图）都直接落盘，同名自动加序号。
 */
export function ExportSettings(): React.ReactElement {
  const [prefs, setPrefs] = React.useState<ExportPrefs | null>(null)

  React.useEffect(() => {
    void window.pkt.exportPrefs().then(setPrefs)
  }, [])

  const chooseDir = async (): Promise<void> => {
    const next = await window.pkt.chooseExportDir()
    if (next) setPrefs(next)
  }

  const update = async (patch: Partial<ExportPrefs>): Promise<void> => {
    setPrefs(await window.pkt.setExportPrefs(patch))
  }

  return (
    <div className="flex flex-col gap-2 text-[12px]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-pkt-text-mute">保存目录</span>
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="max-w-[280px] truncate text-pkt-text-dim"
            title={prefs?.dir ?? '每次保存时询问'}
          >
            {prefs ? (prefs.dir ?? '每次保存时询问') : '读取中…'}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <ButtonRoot size="sm" onPress={() => void chooseDir()}>
          选择目录…
        </ButtonRoot>
        <ButtonRoot
          size="sm"
          variant="ghost"
          isDisabled={!prefs?.dir}
          onPress={() => void update({ dir: null })}
        >
          改回每次询问
        </ButtonRoot>
        <ButtonRoot
          size="sm"
          variant="ghost"
          isDisabled={!prefs?.dir}
          onPress={() => prefs?.dir && void window.pkt.revealPath(prefs.dir)}
        >
          打开目录
        </ButtonRoot>
      </div>

      <label className="flex items-center gap-2">
        <CheckboxRoot
          isSelected={prefs?.openAfterSave ?? false}
          onChange={(selected: boolean) => void update({ openAfterSave: selected })}
        />
        <span>保存成功后自动打开所在文件夹</span>
      </label>

      <p className="text-[11px] leading-relaxed text-pkt-text-mute">
        设了目录后，导出 PNG / GIF / 视频 / 存档都不再弹窗，文件名重复会自动加 (2)(3)。
      </p>
    </div>
  )
}
