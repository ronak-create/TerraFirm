// supercluster wrapper for live businesses at STREET zoom.

import Supercluster from 'supercluster';
import type { Business, LngLatBounds } from '../types';
import type { ClusterSpec, PointSpec } from './markers';

type Props = { id: string };

export class BusinessClusterIndex {
  private index: Supercluster<Props>;
  private byId: Map<string, Business>;

  constructor(businesses: Business[]) {
    this.byId = new Map(businesses.map((b) => [b.id, b]));
    this.index = new Supercluster<Props>({ radius: 64, maxZoom: 17, minPoints: 4 });
    this.index.load(
      businesses.map((b) => ({
        type: 'Feature' as const,
        properties: { id: b.id },
        geometry: { type: 'Point' as const, coordinates: [b.lon, b.lat] },
      }))
    );
  }

  getSpecs(bounds: LngLatBounds, zoom: number, cap: number): Array<ClusterSpec | PointSpec> {
    const clusters = this.index.getClusters(
      [bounds.west, bounds.south, bounds.east, bounds.north],
      Math.round(zoom)
    );
    const specs: Array<ClusterSpec | PointSpec> = [];
    for (const f of clusters) {
      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties as Props & { cluster?: boolean; cluster_id?: number; point_count?: number };
      if (props.cluster) {
        specs.push({ type: 'cluster', id: `cl:${props.cluster_id}`, lon, lat, count: props.point_count ?? 0 });
      } else {
        const entity = this.byId.get(props.id);
        if (entity) specs.push({ type: 'point', id: entity.id, lon, lat, entity, prominence: 0.45 });
      }
      if (specs.length >= cap) break;
    }
    return specs;
  }

  /** Zoom at which a cluster expands — used when a cluster bubble is clicked. */
  expansionZoom(clusterId: number): number {
    try {
      return this.index.getClusterExpansionZoom(clusterId);
    } catch {
      return 16;
    }
  }
}
