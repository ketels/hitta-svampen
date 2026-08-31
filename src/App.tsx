import { useApp, type View } from './state/app.tsx'
import { MapView } from './views/MapView.tsx'
import { ForecastView } from './views/ForecastView.tsx'
import { FindsView } from './views/FindsView.tsx'
import { SpeciesView } from './views/SpeciesView.tsx'
import { MoreView } from './views/MoreView.tsx'
import { IconBook, IconMap, IconBasket, IconMore, IconCloud } from './components/Icons.tsx'

const TABS: { id: View; name: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'map', name: 'Karta', Icon: IconMap },
  { id: 'forecast', name: 'Prognos', Icon: IconCloud },
  { id: 'finds', name: 'Fynd', Icon: IconBasket },
  { id: 'species', name: 'Arter', Icon: IconBook },
  { id: 'more', name: 'Mer', Icon: IconMore },
]

export function App() {
  const { view, setView } = useApp()

  return (
    <div className="app">
      <div className="content">
        {/* The map stays alive in the background so position, zoom and layer
            survive a switch to another tab. */}
        <div style={{ position: 'absolute', inset: 0, visibility: view === 'map' ? 'visible' : 'hidden' }}>
          <MapView active={view === 'map'} />
        </div>
        {view === 'forecast' && <ForecastView />}
        {view === 'finds' && <FindsView />}
        {view === 'species' && <SpeciesView />}
        {view === 'more' && <MoreView />}
      </div>

      <nav className="nav">
        {TABS.map(({ id, name, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon />
            <span>{name}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
