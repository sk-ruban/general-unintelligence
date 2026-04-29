export const SATELLITE_BOUNDS = {
  west: 13.0374,
  south: 32.8,
  east: 32.5626,
  north: 42.8,
} as const;

export const SATELLITE_ASPECT_WIDTH = 1200;
export const SATELLITE_ASPECT_HEIGHT = 780;
export const GRID_MAP_CACHE_SECONDS = 60 * 60 * 24 * 30;

export const SATELLITE_EXPORT_URL = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${SATELLITE_BOUNDS.west},${SATELLITE_BOUNDS.south},${SATELLITE_BOUNDS.east},${SATELLITE_BOUNDS.north}&bboxSR=4326&imageSR=3857&size=${SATELLITE_ASPECT_WIDTH},${SATELLITE_ASPECT_HEIGHT}&format=jpg&f=image`;
export const GRID_MAP_SATELLITE_URL = "/api/grid-map-satellite";
