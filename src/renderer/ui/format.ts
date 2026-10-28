/**
 * 资源清单名 → 只保留最后一个 `_` 后面的时间。
 * `resource_list_28986_202610231755.txt` → `2026-10-23 17:55`
 */
export function formatResourceTime(resourceList: string | null | undefined): string {
  if (!resourceList) return '—'
  const stamp =
    resourceList
      .replace(/\.txt$/i, '')
      .split('_')
      .pop() ?? ''
  if (!/^\d{12}$/.test(stamp)) return stamp || '—'
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}`
}

export function formatSlotTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
