// Post-load customisation of the OpenFreeMap "dark" style: near-black water,
// darker land, muted labels with amber/cyan accents, and globe atmosphere.

import type { Map as MlMap } from 'maplibre-gl';

const WATER = '#05090F';
const LAND = '#0a0f16';
const LAND_ALT = '#0c121b';
const LABEL = '#7d8bb9'; // muted label text
const LABEL_HALO = '#02040a';

export function applyDarkTheme(map: MlMap): void {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', LAND);
      } else if (layer.type === 'fill') {
        if (id.includes('water')) {
          map.setPaintProperty(layer.id, 'fill-color', WATER);
        } else if (id.includes('building')) {
          map.setPaintProperty(layer.id, 'fill-color', '#10171f');
          map.setPaintProperty(layer.id, 'fill-opacity', 0.6);
        } else if (id.includes('landcover') || id.includes('landuse') || id.includes('park') || id.includes('wood')) {
          map.setPaintProperty(layer.id, 'fill-color', LAND_ALT);
          map.setPaintProperty(layer.id, 'fill-opacity', 0.5);
        } else if (id.includes('land')) {
          map.setPaintProperty(layer.id, 'fill-color', LAND);
        }
      } else if (layer.type === 'line') {
        if (id.includes('water')) {
          map.setPaintProperty(layer.id, 'line-color', WATER);
        } else if (id.includes('boundary') || id.includes('admin')) {
          map.setPaintProperty(layer.id, 'line-color', '#243244');
          map.setPaintProperty(layer.id, 'line-opacity', 0.6);
        } else if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
          map.setPaintProperty(layer.id, 'line-color', '#26303c');
        } else if (id.includes('road') || id.includes('street') || id.includes('transport') || id.includes('bridge')) {
          map.setPaintProperty(layer.id, 'line-color', '#1a2129');
        }
      } else if (layer.type === 'symbol') {
        // Mute and tint label text.
        if (map.getLayoutProperty(layer.id, 'text-field')) {
          map.setPaintProperty(layer.id, 'text-color', LABEL);
          map.setPaintProperty(layer.id, 'text-halo-color', LABEL_HALO);
          map.setPaintProperty(layer.id, 'text-halo-width', 1.2);
          if (id.includes('place') && (id.includes('city') || id.includes('capital') || id.includes('country'))) {
            map.setPaintProperty(layer.id, 'text-color', '#c7d2e0');
          }
        }
      }
    } catch {
      // Layer doesn't support that property in this style version — ignore.
    }
  }

  // Globe atmosphere / fog for depth at low zoom (renderer-dependent API).
  const withFog = map as unknown as { setFog?: (f: unknown) => void };
  try {
    withFog.setFog?.({
      color: 'rgba(8, 14, 22, 0.9)',
      'high-color': 'rgba(12, 28, 48, 1)',
      'horizon-blend': 0.04,
      'space-color': '#02030a',
      'star-intensity': 0.5,
    });
  } catch {
    // Older renderer without fog support — fine.
  }
}
