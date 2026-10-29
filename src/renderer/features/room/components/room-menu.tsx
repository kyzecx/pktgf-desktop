import * as React from 'react'
import { Dropdown } from '@heroui/react'

/**
 * 顶栏的「导出」二级菜单。
 *
 * 导出图片 / 视频、导出存档、导入存档都是「把房间带走」，
 * 放同一个菜单里，顶栏就不会被一排按钮撑满。
 */
export function ExportMenu({
  onOpenExport,
  onExportPkg,
  onImportPkg,
  busy,
}: {
  /** 打开导出浮窗（PNG / GIF / 视频 / 序列） */
  onOpenExport: () => void
  onExportPkg: () => void
  onImportPkg: () => void
  busy: boolean
}): React.ReactElement {
  return (
    <Dropdown.Root>
      {/* Dropdown.Trigger 自己就是 <button>（react-aria），不能再嵌 ButtonRoot */}
      <Dropdown.Trigger className="button button--sm button--ghost">
        导出
        <span className="ml-0.5 text-[9px] text-pkt-text-mute">▾</span>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          onAction={(key) => {
            if (key === 'images') onOpenExport()
            if (key === 'export-pkg') onExportPkg()
            if (key === 'import-pkg') onImportPkg()
          }}
        >
          <Dropdown.Item id="images" textValue="图片 / 视频">
            图片 / 视频（PNG · GIF · MP4）…
          </Dropdown.Item>
          <Dropdown.Item id="export-pkg" textValue="导出存档" isDisabled={busy}>
            导出存档（.pktroom）
          </Dropdown.Item>
          <Dropdown.Item id="import-pkg" textValue="导入存档" isDisabled={busy}>
            导入存档…
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown.Root>
  )
}
