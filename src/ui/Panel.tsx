import { useStore } from '../state/store';
import type { Business, Company, Entity } from '../types';
import { monogramDataUrl, resolveLogo } from '../data/logos';
import { CONFIG } from '../config';

function EntityLogo({ entity, size = 56 }: { entity: Entity; size?: number }) {
  const primary = resolveLogo({
    name: entity.name,
    logoUrl: entity.logoUrl,
    domain: entity.domain,
    key: entity.id,
    useFavicon: CONFIG.useFaviconService,
  });
  const fallback = monogramDataUrl(entity.name, entity.id);
  return (
    <img
      className="tf-panel__logo"
      width={size}
      height={size}
      src={primary}
      alt=""
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== fallback) img.src = fallback;
      }}
    />
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="tf-panel__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CompanyBody({ c }: { c: Company }) {
  return (
    <dl className="tf-panel__rows">
      <Row label="Industry">{c.industry}</Row>
      <Row label="Headquarters">{c.hqLabel}</Row>
      <Row label="Founded">{c.inception ? c.inception.slice(0, 10) : null}</Row>
      <Row label="Employees">{c.employees ? c.employees.toLocaleString() : null}</Row>
      <Row label="Coordinates">
        {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
      </Row>
      <Row label="Website">
        {c.website ? (
          <a href={c.website} target="_blank" rel="noopener noreferrer">
            {c.domain ?? c.website}
          </a>
        ) : null}
      </Row>
    </dl>
  );
}

function BusinessBody({ b }: { b: Business }) {
  return (
    <dl className="tf-panel__rows">
      <Row label="Category">{b.category}</Row>
      <Row label="Cuisine">{b.cuisine}</Row>
      <Row label="Address">{b.address}</Row>
      <Row label="Hours">{b.openingHours}</Row>
      <Row label="Phone">{b.phone ? <a href={`tel:${b.phone}`}>{b.phone}</a> : null}</Row>
      <Row label="Coordinates">
        {b.lat.toFixed(5)}, {b.lon.toFixed(5)}
      </Row>
      <Row label="Website">
        {b.website ? (
          <a href={b.website} target="_blank" rel="noopener noreferrer">
            {b.domain ?? b.website}
          </a>
        ) : null}
      </Row>
    </dl>
  );
}

export function Panel() {
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  if (!selected) return null;

  const isCompany = selected.kind === 'company';
  const osmLink =
    selected.kind === 'business' && selected.osmType && selected.osmId
      ? `https://www.openstreetmap.org/${selected.osmType}/${selected.osmId}`
      : undefined;
  const wdLink = isCompany ? `https://www.wikidata.org/wiki/${(selected as Company).wikidataId}` : undefined;

  return (
    <aside className="tf-panel" role="dialog" aria-label={`${selected.name} details`}>
      <button className="tf-panel__close" onClick={() => select(null)} aria-label="Close details">
        ✕
      </button>
      <header className="tf-panel__head">
        <EntityLogo entity={selected} />
        <div>
          <h2 className="tf-panel__name">{selected.name}</h2>
          <span className={`tf-pill tf-pill--${isCompany ? 'company' : 'place'}`}>
            {isCompany ? 'COMPANY' : 'LOCAL BUSINESS'}
          </span>
        </div>
      </header>

      {isCompany ? <CompanyBody c={selected as Company} /> : <BusinessBody b={selected as Business} />}

      <footer className="tf-panel__foot">
        {selected.website && (
          <a className="tf-btn tf-btn--primary" href={selected.website} target="_blank" rel="noopener noreferrer">
            Visit website ↗
          </a>
        )}
        {osmLink && (
          <a className="tf-btn" href={osmLink} target="_blank" rel="noopener noreferrer">
            Open in OSM ↗
          </a>
        )}
        {wdLink && (
          <a className="tf-btn" href={wdLink} target="_blank" rel="noopener noreferrer">
            Open in Wikidata ↗
          </a>
        )}
        <p className="tf-panel__source">
          Source: {isCompany ? 'Wikidata' : (selected as Business).source === 'overture' ? 'Overture Maps' : 'OpenStreetMap'}
        </p>
      </footer>
    </aside>
  );
}
