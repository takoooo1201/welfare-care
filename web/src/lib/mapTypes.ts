export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  title: string;
  label?: string;
  approximate?: boolean;
  kind?: 'pin' | 'dot';
}
