export interface PartnerIndicator {
  x: number;
  y: number;
  angle: number;
}

export function getPartnerIndicator(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  viewportWidth: number,
  viewportHeight: number,
  targetRadius: number,
  safeInset: number
): PartnerIndicator | null {
  const targetVisible = targetX + targetRadius >= 0
    && targetX - targetRadius <= viewportWidth
    && targetY + targetRadius >= 0
    && targetY - targetRadius <= viewportHeight;
  if (targetVisible) return null;

  const minX = safeInset;
  const maxX = viewportWidth - safeInset;
  const minY = safeInset;
  const maxY = viewportHeight - safeInset;
  const startX = Math.max(minX, Math.min(maxX, originX));
  const startY = Math.max(minY, Math.min(maxY, originY));
  const dx = targetX - originX;
  const dy = targetY - originY;
  const tx = dx > 0 ? (maxX - startX) / dx : dx < 0 ? (minX - startX) / dx : Infinity;
  const ty = dy > 0 ? (maxY - startY) / dy : dy < 0 ? (minY - startY) / dy : Infinity;
  const distance = Math.min(tx, ty);

  return {
    x: startX + dx * distance,
    y: startY + dy * distance,
    angle: Math.atan2(dy, dx)
  };
}
