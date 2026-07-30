/** Canonical `"x,y"` string key for a tile coordinate in maps and sets. */
export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}
