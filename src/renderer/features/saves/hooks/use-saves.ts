import * as React from 'react'

import type { SaveRecord } from '@shared/contract'

/** 所有工具的存档列表；读/写/删都走主进程的 saves.json。 */
export function useSaves(): {
  saves: SaveRecord[]
  put: (save: SaveRecord) => Promise<void>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
} {
  const [saves, setSaves] = React.useState<SaveRecord[]>([])

  const refresh = React.useCallback(async () => {
    setSaves(await window.pkt.listSaves())
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const put = React.useCallback(async (save: SaveRecord) => {
    setSaves(await window.pkt.putSave(save))
  }, [])

  const remove = React.useCallback(async (id: string) => {
    setSaves(await window.pkt.deleteSave(id))
  }, [])

  return { saves, put, remove, refresh }
}
