export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  title: string;
  label?: string;
  approximate?: boolean;
  kind?: 'pin' | 'dot';
  /** false：地圖自動縮放時不把這個點算進去（例如雷達範圍外的個案） */
  fit?: boolean;
}
