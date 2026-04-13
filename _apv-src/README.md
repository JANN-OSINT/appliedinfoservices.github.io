# APV tool source (`_apv-src`)

This directory contains the React + Vite + TypeScript source for the
**Applied Flight Visualizer (APV)** tool, served at `/tools/apv/` on
`appliedinformationservices.com`.

It wraps two open-source component sets:

- [`flightcn`](https://github.com/ridemountainpig/flightcn) — flight-route
  visualization (great-circle arcs, airport markers, labels, animations)
- [`mapcn`](https://github.com/AnmolSaini16/mapcn) — React wrapper around
  MapLibre GL

Both libraries are distributed through the shadcn registry (not npm). Their
source files are vendored directly into `src/components/ui/`:

- `flight.tsx`, `flight-airports.ts`, `flight-airports-utils.ts`
- `map.tsx`

## Why is this directory named `_apv-src`?

GitHub Pages runs Jekyll by default, which excludes any top-level directory
starting with an underscore from the published site. This keeps the React
source committed to the repo (for reproducibility) without serving `.tsx`
files to the public. Only the built output at `/tools/apv/` is served.

## Rebuilding

```bash
cd _apv-src
npm install          # first time only
npm run build        # emits into ../tools/apv/
```

After rebuilding, commit the changes in **both** `_apv-src/` (if any) and
`tools/apv/` (the build output).

## Local preview

```bash
cd _apv-src
npm run dev          # standalone Vite dev server — header/footer fetches will 404
```

The dev server does not serve the parent site's `css/main.css` or
`includes/header.html`, so during development the page chrome won't match
production. To preview the production build against the real site:

```bash
cd _apv-src && npm run build
cd ..                              # repo root
python3 -m http.server 8000
# Open http://localhost:8000/tools/apv/
```

## Updating vendored flightcn / mapcn

```bash
cd _apv-src/src/components/ui
curl -sSLO https://raw.githubusercontent.com/ridemountainpig/flightcn/main/src/registry/flight.tsx
curl -sSLO https://raw.githubusercontent.com/ridemountainpig/flightcn/main/src/registry/flight-airports.ts
curl -sSLO https://raw.githubusercontent.com/ridemountainpig/flightcn/main/src/registry/flight-airports-utils.ts
curl -sSLO https://raw.githubusercontent.com/AnmolSaini16/mapcn/main/src/registry/map.tsx
```

Then re-run `npm run build` and verify the tool still functions end-to-end.
