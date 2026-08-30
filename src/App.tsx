import { useApp, type Vy } from './state/app.tsx'
import { KartVy } from './views/KartVy.tsx'
import { PrognosVy } from './views/PrognosVy.tsx'
import { FyndVy } from './views/FyndVy.tsx'
import { ArtVy } from './views/ArtVy.tsx'
import { MerVy } from './views/MerVy.tsx'
import { IkonBok, IkonKarta, IkonKorg, IkonMer, IkonMoln } from './components/Ikoner.tsx'

const FLIKAR: { id: Vy; namn: string; Ikon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'karta', namn: 'Karta', Ikon: IkonKarta },
  { id: 'prognos', namn: 'Prognos', Ikon: IkonMoln },
  { id: 'fynd', namn: 'Fynd', Ikon: IkonKorg },
  { id: 'arter', namn: 'Arter', Ikon: IkonBok },
  { id: 'mer', namn: 'Mer', Ikon: IkonMer },
]

export function App() {
  const { vy, setVy } = useApp()

  return (
    <div className="app">
      <div className="innehall">
        {/* Kartan lever kvar i bakgrunden så position, zoom och lager
            överlever ett byte till en annan flik. */}
        <div style={{ position: 'absolute', inset: 0, visibility: vy === 'karta' ? 'visible' : 'hidden' }}>
          <KartVy aktiv={vy === 'karta'} />
        </div>
        {vy === 'prognos' && <PrognosVy />}
        {vy === 'fynd' && <FyndVy />}
        {vy === 'arter' && <ArtVy />}
        {vy === 'mer' && <MerVy />}
      </div>

      <nav className="nav">
        {FLIKAR.map(({ id, namn, Ikon }) => (
          <button
            key={id}
            onClick={() => setVy(id)}
            aria-current={vy === id ? 'page' : undefined}
          >
            <Ikon />
            <span>{namn}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
