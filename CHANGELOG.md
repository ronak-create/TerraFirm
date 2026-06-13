# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Overture Maps Places adapter for full offline-scale POI coverage without depending on Overpass.
- Authoritative regional company data from public registries.

## [0.1.0] - 2026-06-13

Initial public release of TerraFirm, a dark-mode 3D global business atlas.

### Added

- Full-bleed 3D globe built on MapLibre GL JS v5 that flattens into a pan/zoom street map as you zoom in.
- Three altitude tiers driven by zoom: ORBIT (rotating globe with the world's biggest companies), REGIONAL (H3 hexagon density shading), and STREET (live local businesses).
- Company layer powered by a bundled Wikidata snapshot for instant first paint, with no API keys required.
- Live street businesses from the Overpass API with per-IP rate-limit handling, four mirror failover, jittered backoff, and IndexedDB caching.
- Global business search via Nominatim, debounced to respect usage policy.
- Deterministic per-cell colouring for the regional H3 density layer and per-country tint below zoom 9.
- Client-side clustering of street businesses with supercluster.
- Dependency-free IndexedDB key/value cache with TTL and an in-memory fast path.
- Live status bar with scanning, live, and unreachable indicators plus a manual refresh control.
- Deployment configs for Vercel, Netlify, Cloudflare Pages, and GitHub Pages, including SPA fallback and cache headers.
- Social share image generation from an SVG source.
- Accessibility support: full keyboard navigation, focusable controls, and prefers-reduced-motion handling.
- Responsive layout for mobile with touch pan and pinch.
- Unit tests for the pure data transforms and a smoke test for live data-source reachability.

### Attribution

- Map data from OpenStreetMap contributors, company data from Wikidata, base tiles from OpenFreeMap, and country borders from Natural Earth.

[Unreleased]: https://github.com/ronak-create/TerraFirm/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ronak-create/TerraFirm/releases/tag/v0.1.0
