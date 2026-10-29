/**
 * 版本更新公告（内置）。
 *
 * 不依赖网络：每次升级后第一次打开会弹一次「本次更新」，
 * 设置页也有一份完整更新日志。`version` 与 `package.json` 保持一致。
 */

export interface ChangelogEntry {
  version: string
  /** 发布日（YYYY-MM-DD） */
  date: string
  title: string
  items: Array<{ group: string; text: string }>
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.4.0',
    date: '2026-10-29',
    title: '建造 · 装修大版本',
    items: [
      { group: '建造', text: '45° 网格自动拼接：281 个房型、92 个拼接房型几何自检全部通过' },
      { group: '建造', text: '15 632 件家具，含挂墙、叠放、深度排序、灯光与遮罩' },
      {
        group: '建造',
        text: '角色 / NPC：10 个部位、40×60 小模型、官方 255 组动作与 45 组 NPC 动作',
      },
      { group: '建造', text: '拖拽移动角色、多选与对齐、图层面板（按真实绘制顺序）' },
      {
        group: '建造',
        text: '导出 PNG / GIF / PNG 序列 / MP4（MP4 需系统 ffmpeg），存档可导出 .pktroom 分享',
      },
      { group: '建造', text: '自定义导入：家具、角色包、动作，全部走官方渲染路径' },
      { group: '资源', text: '每 5 分钟自动检查官方版本，发现更新就在应用内重建目录，不用等发版' },
      {
        group: '其它',
        text: '工作台改版：功能入口 + 资源规模 + 最近存档；导出可固定保存目录并自动打开',
      },
      {
        group: '修复',
        text: '动作 hair 字段误当头部帧导致的头部闪烁、服饰只取第 0 帧导致的坐姿叠两层',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-26',
    title: '图鉴与卖货图',
    items: [
      { group: '图鉴', text: '家具 / 服饰 / NPC 分类浏览与原图查看' },
      { group: '图鉴', text: '卖货图生成与导出' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-24',
    title: '图鉴、列表设置与浅色主题',
    items: [
      { group: '图鉴', text: '图鉴页与列表设置' },
      { group: '搭配', text: '搭配历史记录' },
      { group: '外观', text: '浅色主题' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-21',
    title: '首个版本',
    items: [{ group: '搭配', text: '在线衣柜与像素搭配、存档与导出' }],
  },
]

export const CURRENT_VERSION = CHANGELOG[0]?.version ?? '0.0.0'

/** 这个版本相对上一版的更新（用于「本次更新」弹窗）。 */
export function latestEntry(): ChangelogEntry | null {
  return CHANGELOG[0] ?? null
}
