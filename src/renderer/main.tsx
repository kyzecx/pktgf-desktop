import * as React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './ui/styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 挂载点')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
