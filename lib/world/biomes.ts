// Five biome palettes. Stone and lantern colours are fixed by the brand; biomes change ground, grass and water.
export const BIOMES = ['meadow', 'dune', 'tundra', 'reef', 'ember'] as const;
export type Biome = (typeof BIOMES)[number];

export type Palette = {
  lush: string;
  dry: string;
  sand: string;
  water: string;
  fog: string;
  grass: string;
  label: string;
};

export const PALETTES: Record<Biome, Palette> = {
  meadow: { lush: '#7FB069', dry: '#C9B46A', sand: '#D9C9A3', water: '#6FA8C7', fog: '#C7D5E0', grass: '#8FC57A', label: 'Meadow' },
  dune:   { lush: '#9FB36B', dry: '#D4B978', sand: '#E6D3A9', water: '#7FB2C9', fog: '#E3D6C0', grass: '#AFBE7A', label: 'Dune' },
  tundra: { lush: '#8FAF9C', dry: '#B8B9A5', sand: '#D8DAD2', water: '#86B4CC', fog: '#D2DCE3', grass: '#9DB8A8', label: 'Tundra' },
  reef:   { lush: '#6FB39B', dry: '#BFC08A', sand: '#E2D7B5', water: '#5FA7C9', fog: '#BFD8E6', grass: '#7FC2A8', label: 'Reef' },
  ember:  { lush: '#8E9D5C', dry: '#C79B5C', sand: '#D8B58E', water: '#6F9FC2', fog: '#D9C2B4', grass: '#9EA96A', label: 'Ember' },
};

export const STONE = ['#E8DCC8', '#D4C3A5', '#B8A382'] as const;
export const LANTERN = '#FFD089';
export const SKY = { dawn: '#FFB38A', noon: '#BFE3FF', evening: '#FFC46B', night: '#1B2436' } as const;
