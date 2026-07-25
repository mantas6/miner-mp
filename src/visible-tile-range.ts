export interface VisibleTileRange {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

export function getVisibleTileRange(
  camX: number,
  camY: number,
  visibleColumns: number,
  visibleRows: number,
  worldWidth: number,
  worldHeight?: number,
  overscan = 1
): VisibleTileRange {
  const cameraColumn = Math.floor(camX);
  const cameraRow = Math.floor(camY);

  return {
    startX: Math.max(0, cameraColumn - overscan),
    endX: Math.min(worldWidth - 1, cameraColumn + visibleColumns + overscan),
    startY: Math.max(0, cameraRow - overscan),
    endY: worldHeight === undefined
      ? cameraRow + visibleRows + overscan
      : Math.min(worldHeight - 1, cameraRow + visibleRows + overscan)
  };
}
