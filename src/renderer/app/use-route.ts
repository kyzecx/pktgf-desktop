import * as React from 'react'

export type Route = 'launcher' | 'outfits' | 'room' | 'catalog' | 'saves' | 'settings'

const ROUTES: Route[] = ['launcher', 'outfits', 'room', 'catalog', 'saves', 'settings']

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split('/')[0] ?? ''
  return (ROUTES.find((route) => route === name) ?? 'launcher') as Route
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = React.useState<Route>(() => parse(window.location.hash))

  React.useEffect(() => {
    const onHashChange = (): void => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = React.useCallback((next: Route) => {
    if (parse(window.location.hash) === next) return
    window.location.hash = `#/${next}`
  }, [])

  return [route, navigate]
}
