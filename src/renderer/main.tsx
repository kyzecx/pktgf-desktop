import * as React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { applyInitialTheme } from './ui/theme'
import './ui/styles.css'

applyInitialTheme()

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 挂载点')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
