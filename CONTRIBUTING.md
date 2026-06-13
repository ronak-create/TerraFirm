# Contributing to TerraFirm

First off, thanks for taking the time to contribute! TerraFirm is a community-friendly project and every contribution helps make the global business atlas better.

This document explains how to get set up, the conventions we follow, and how to propose changes.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it. Please report unacceptable behaviour by opening an issue.

## Ways to contribute

- Report bugs and unexpected behaviour by opening an issue.
- Suggest new features or data sources.
- Improve documentation, examples, or the README.
- Submit pull requests that fix bugs or add features.
- Help triage existing issues and review open pull requests.

Look for issues labelled `good first issue` and `help wanted` if you are not sure where to start.

## Development setup

TerraFirm is a static Vite + React + TypeScript single-page app. There is no backend, no database, and no API keys to configure.

```bash
# 1. Fork and clone the repo
git clone https://github.com/<your-username>/TerraFirm.git
cd TerraFirm

# 2. Install dependencies
npm install

# 3. Start the dev server at http://localhost:5173
npm run dev
```

Useful scripts:

- `npm run build` builds the static bundle into `dist/`.
- `npm run preview` serves the production build locally.
- `npm run test` runs unit tests for the pure data transforms.
- `npm run smoke` checks that Wikidata and Overpass are reachable.

## Project structure

See the **Project layout** section of the README for a full file-by-file breakdown. In short: data fetchers live in `src/data/`, map rendering in `src/map/`, UI in `src/ui/`, and all tunables in `src/config.ts`.

## Pull request process

1. Create a branch from `main` with a descriptive name, e.g. `fix/regional-density` or `feat/overture-adapter`.
2. Make your change. Keep pull requests focused on a single concern.
3. Add or update tests where it makes sense, especially for the pure transforms in `src/data/`.
4. Run `npm run test` and `npm run build` to make sure everything passes.
5. Update documentation if your change affects behaviour or configuration.
6. Open a pull request against `main` and fill in the template. Link any related issues.

## Coding conventions

- TypeScript everywhere. Keep data transforms pure and unit-testable.
- Keep new data adapters mapped to the source-agnostic `Business` / `Company` shapes in `src/types.ts`.
- Respect the data-source etiquette described in the README. Do not add code that hammers shared community APIs like Overpass or Nominatim.
- Match the existing formatting. Two-space indentation, no unused imports.

## Reporting bugs

When filing a bug, please include:

- What you expected to happen and what actually happened.
- Steps to reproduce, including the zoom level and region of the map.
- Your browser and operating system.
- Any relevant console errors or screenshots.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE.md).
