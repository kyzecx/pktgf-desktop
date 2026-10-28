import { CardContent, CardHeader, CardRoot, CardTitle } from '@heroui/react'
import * as React from 'react'

/** 二级菜单里的分段卡片：标题 + 计数 + 右侧操作 + 内容。 */
export function Section({
  title,
  count,
  actions,
  children,
}: {
  title: string
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
}): React.ReactElement {
  return (
    <CardRoot
      variant="secondary"
      className="shrink-0 gap-0 rounded-pkt border border-pkt-border/70 bg-pkt-panel/60 p-0"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 pt-2.5 pb-0">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <CardTitle className="text-xs font-semibold text-pkt-text-dim">{title}</CardTitle>
          {count !== undefined ? (
            <span className="text-[10px] tabular-nums text-pkt-text-mute">{count}</span>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </CardHeader>
      <CardContent className="p-2.5 pt-2">{children}</CardContent>
    </CardRoot>
  )
}
