const isMac = window.pkt.platform === 'darwin'

/** 显示用的快捷键文案；逻辑里同时接受 Meta 和 Ctrl。 */
export const SAVE_SHORTCUT = isMac ? '⌘S' : 'Ctrl+S'
export const EXPORT_SHORTCUT = isMac ? '⌘E' : 'Ctrl+E'
export const EXPORT_GIF_SHORTCUT = isMac ? '⇧⌘E' : 'Ctrl+Shift+E'
