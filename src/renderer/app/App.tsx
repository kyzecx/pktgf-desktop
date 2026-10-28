import * as React from 'react'

import type { AppInfo, SaveRecord } from '@shared/contract'
import { CatalogProvider, useCatalog } from './catalog-context'
import { useRoute, type Route } from './use-route'

import { LauncherPage } from '@features/launcher/launcher-page'
import { CatalogPage } from '@features/catalog/catalog-page'
import { OutfitsPage } from '@features/outfits/outfits-page'
import { SettingsPage } from '@features/settings/settings-page'
import { SavesPage } from '@features/saves/saves-page'
import { applyOutfitSave } from '@features/outfits/state/outfit-save'
import { IconBook, IconFolder, IconMoon, IconSettings, IconShirt, IconSun } from '@ui/icons'
import { useTheme } from '@ui/theme'
import logo from '@/assets/pktgf-logo.png'
import { AppShell, NavRail, StatusBar, TitleBar } from '@ui/layout'
import { formatResourceTime } from '@ui/format'
import { EmptyStateRoot, SpinnerRoot } from '@heroui/react'

const NAV = [
  {
    key: 'launcher' as const,
    label: '工作台',
    icon: <img src={logo} alt="" draggable={false} className="size-6 rounded-md object-cover" />,
  },
  { key: 'outfits' as const, label: '搭配', icon: <IconShirt /> },
  { key: 'catalog' as const, label: '图鉴', icon: <IconBook /> },
  { key: 'saves' as const, label: '存档', icon: <IconFolder /> },
]

const ROUTE_TITLE: Record<Route, string> = {
  launcher: '皮卡堂工坊',
  outfits: '搭配 · 在线衣柜',
  catalog: '图鉴',
  saves: '存档管理',
  settings: '设置',
}

export function App(): React.ReactElement {
  return (
    <CatalogProvider>
      <AppFrame />
    </CatalogProvider>
  )
}

function AppFrame(): React.ReactElement {
  const [route, navigate] = useRoute()
  const [theme, toggleTheme] = useTheme()
  const { catalog, meta, assets, version, error } = useCatalog()
  const [info, setInfo] = React.useState<AppInfo | null>(null)

  React.useEffect(() => {
    void window.pkt.getAppInfo().then(setInfo)
  }, [])

  const navItems = NAV.map((entry) => ({ ...entry, active: route === entry.key }))
  const bottomNavItems = [
    {
      key: 'theme',
      label: theme === 'dark' ? '浅色' : '深色',
      icon: theme === 'dark' ? <IconSun /> : <IconMoon />,
      active: false,
    },
    {
      key: 'settings' as const,
      label: '设置',
      icon: <IconSettings />,
      active: route === 'settings',
    },
  ]

  return (
    <AppShell
      titleBar={
        <TitleBar platform={window.pkt.platform} title={ROUTE_TITLE[route]}>
          {version && !version.upToDate ? (
            <span className="mr-2 rounded-pkt border border-pkt-warn/40 bg-pkt-warn/10 px-1.5 py-0.5 text-[10px] text-pkt-warn">
              官方客户端已更新
            </span>
          ) : null}
        </TitleBar>
      }
      rail={
        <NavRail
          items={navItems}
          bottomItems={bottomNavItems}
          active={route}
          onSelect={(key) => {
            if (key === 'theme') toggleTheme()
            else navigate(key as Route)
          }}
        />
      }
      statusBar={
        <StatusBar
          left={<span>资源 {formatResourceTime(meta?.resourceList)}</span>}
          right={
            <>
              <span>v{info?.appVersion ?? '0.0.0'}</span>
              {route !== 'launcher' ? (
                <span>
                  {catalog ? `${catalog.items.length.toLocaleString()} 件服饰` : '加载中'}
                </span>
              ) : null}
            </>
          }
        />
      }
    >
      <RouteView
        route={route}
        navigate={navigate}
        catalog={catalog}
        assets={assets}
        faces={catalog?.faces ?? []}
        version={version}
        info={info}
        error={error}
      />
    </AppShell>
  )
}

function RouteView({
  route,
  navigate,
  catalog,
  assets,
  faces,
  version,
  info,
  error,
}: {
  route: Route
  navigate: (route: Route) => void
  catalog: ReturnType<typeof useCatalog>['catalog']
  assets: ReturnType<typeof useCatalog>['assets']
  faces: NonNullable<ReturnType<typeof useCatalog>['catalog']>['faces']
  version: ReturnType<typeof useCatalog>['version']
  info: AppInfo | null
  error: string | null
}): React.ReactElement {
  if (route === 'settings') return <SettingsPage info={info} version={version} />
  if (route === 'launcher') {
    return (
      <LauncherPage
        catalog={catalog}
        info={info}
        onOpenOutfits={() => navigate('outfits')}
        onOpenCatalog={() => navigate('catalog')}
      />
    )
  }
  if (route === 'saves') {
    return (
      <SavesPage
        onOpenSave={(save: SaveRecord) => {
          if (applyOutfitSave(catalog, save)) navigate('outfits')
        }}
        onOpenOutfits={() => navigate('outfits')}
      />
    )
  }
  if (error) {
    return (
      <EmptyStateRoot className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">目录加载失败</p>
        <p className="max-w-sm text-xs whitespace-pre-line text-muted">
          {error}
          {'\n'}请重新运行 npm run catalog:build 生成资源快照。
        </p>
      </EmptyStateRoot>
    )
  }
  if (!catalog || !assets) {
    return (
      <div className="grid h-full place-items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-pkt-text-mute">
          <SpinnerRoot size="sm" color="accent" />
          <span className="text-xs">正在载入官方目录…</span>
        </div>
      </div>
    )
  }

  if (route === 'catalog') return <CatalogPage catalog={catalog} assets={assets} />

  return <OutfitsPage catalog={catalog} assets={assets} faces={faces} />
}
