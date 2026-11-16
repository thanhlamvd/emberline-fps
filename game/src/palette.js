// The look plan, in one place. Six neutrals and one accent hue from the starter,
// plus the two team colours (EMBER orange, ASHEN blue), a furnace glow and the
// red/green of damage and success. The same names are the CSS custom properties.
export const PALETTE = {
  canvas: '#14161a',
  surface: '#1e2228',
  hairline: '#2c323a',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  ember: '#ff7a1a',
  ash: '#7fa8c9',
  glow: '#ffb347',
  danger: '#e5484d',
  good: '#46a758',
};

export function shade(name) {
  return PALETTE[name];
}
