import { MapView } from './map/MapView';
import { SearchBar } from './ui/SearchBar';
import { StatusBar } from './ui/StatusBar';
import { AltitudeRail } from './ui/AltitudeRail';
import { Panel } from './ui/Panel';
import { Toasts } from './ui/Toasts';
import { useStore } from './state/store';

export default function App() {
  const companiesLoading = useStore((s) => s.companiesLoading);

  return (
    <div className="tf-app">
      <MapView />

      <header className="tf-topbar">
        <div className="tf-wordmark">
          <span className="tf-wordmark__glyph" aria-hidden="true" />
          <span className="tf-wordmark__text">
            TERRA<b>FIRM</b>
          </span>
          <span className="tf-wordmark__tag">global business atlas</span>
        </div>
        <SearchBar />
      </header>

      <AltitudeRail />
      <Panel />
      <Toasts />

      <footer className="tf-bottombar">
        <StatusBar />
        <div className="tf-attribution">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors ·{' '}
          <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> · tiles{' '}
          <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
        </div>
      </footer>

      {companiesLoading && (
        <div className="tf-boot" role="status">
          <span className="tf-boot__spinner" />
          <span>Loading the world’s major companies…</span>
        </div>
      )}
    </div>
  );
}
