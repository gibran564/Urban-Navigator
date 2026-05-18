import type { Container } from 'pixi.js';

export const LAYER_NAMES = [
  'background',
  'grid',
  'events',
  'traffic',
  'analysis',
  'routes',
  'markers',
  'labels',
  'hover',
  'taxi',
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

export class LayerManager {
  private readonly layers = new Map<LayerName, Container>();

  constructor(stage: Container, createContainer: () => Container) {
    for (const name of LAYER_NAMES) {
      const container = createContainer();
      stage.addChild(container);
      this.layers.set(name, container);
    }
  }

  get(name: LayerName): Container {
    const layer = this.layers.get(name);
    if (!layer) throw new Error(`Missing renderer layer: ${name}`);
    return layer;
  }

  clear(name: LayerName): Container {
    const layer = this.get(name);
    layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    return layer;
  }

  clearAll(): void {
    for (const name of LAYER_NAMES) this.clear(name);
  }
}
