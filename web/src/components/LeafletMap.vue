<script setup lang="ts">
// 開源地圖：Leaflet（BSD-2）＋ OpenStreetMap 圖資（ODbL）。
import L from 'leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GeoPoint, RouteStop } from '@shared/types.ts';
import type { MapMarker } from '@/lib/mapTypes';

const props = withDefaults(
  defineProps<{
    markers?: MapMarker[];
    route?: RouteStop[];
    routeBuffer?: number; // 公尺，畫出路線兩側的雷達範圍
    you?: GeoPoint | null;
    center?: GeoPoint;
    zoom?: number;
    height?: string;
    fitKey?: string | number;
    selectedId?: string | null;
  }>(),
  {
    markers: () => [],
    route: () => [],
    routeBuffer: 0,
    you: null,
    center: () => ({ lat: 25.0478, lng: 121.5319 }),
    zoom: 14,
    height: '360px',
    fitKey: 0,
    selectedId: null,
  },
);
const emit = defineEmits<{ select: [id: string]; mapClick: [p: GeoPoint] }>();

const el = ref<HTMLDivElement>();
let map: L.Map | null = null;
let layer: L.LayerGroup | null = null;

/** 路線緩衝區：每段畫成矩形、每個站點畫成圓，放進同一個多邊形，填色時自然聯集不會疊色 */
function corridor(route: RouteStop[], meters: number): L.LatLngExpression[][] {
  const rings: L.LatLngExpression[][] = [];
  const latM = 1 / 111320;
  const orient = (ring: [number, number][]) => {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [y1, x1] = ring[i];
      const [y2, x2] = ring[(i + 1) % ring.length];
      area += x1 * y2 - x2 * y1;
    }
    return area < 0 ? ring.reverse() : ring;
  };
  for (const p of route) {
    const lngM = latM / Math.cos((p.lat * Math.PI) / 180);
    const ring: [number, number][] = [];
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      ring.push([p.lat + Math.sin(a) * meters * latM, p.lng + Math.cos(a) * meters * lngM]);
    }
    rings.push(orient(ring));
  }
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const lngM = latM / Math.cos((a.lat * Math.PI) / 180);
    const dx = (b.lng - a.lng) / lngM;
    const dy = (b.lat - a.lat) / latM;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * meters;
    const ny = (dx / len) * meters;
    const ring: [number, number][] = [
      [a.lat + ny * latM, a.lng + nx * lngM],
      [b.lat + ny * latM, b.lng + nx * lngM],
      [b.lat - ny * latM, b.lng - nx * lngM],
      [a.lat - ny * latM, a.lng - nx * lngM],
    ];
    rings.push(orient(ring));
  }
  return rings;
}

function pinIcon(color: string, label: string, selected: boolean): L.DivIcon {
  const size = selected ? 36 : 28;
  return L.divIcon({
    className: '',
    html: `<div class="map-pin" style="width:${size}px;height:${size}px;background:${color};${selected ? 'outline:3px solid #F5BA4B;' : ''}">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function draw(fit: boolean) {
  if (!map || !layer) return;
  layer.clearLayers();
  const bounds: L.LatLngExpression[] = [];

  if (props.route.length) {
    if (props.routeBuffer > 0) {
      L.polygon(corridor(props.route, props.routeBuffer), {
        stroke: false,
        fillColor: '#5AB4C5',
        fillOpacity: 0.18,
        fillRule: 'nonzero', // 預設 evenodd 會讓重疊處變成破洞
        interactive: false,
      }).addTo(layer);
    }
    L.polyline(
      props.route.map((s) => [s.lat, s.lng] as L.LatLngTuple),
      { color: '#1d6f80', weight: 5, opacity: 0.85, dashArray: '1 0' },
    ).addTo(layer);
    props.route.forEach((s, i) => {
      L.marker([s.lat, s.lng], { icon: pinIcon('#1d6f80', String(i + 1), false), title: s.name, zIndexOffset: 500 })
        .bindTooltip(`${s.time ? s.time + ' ' : ''}${s.name}`, { direction: 'top', offset: [0, -14] })
        .addTo(layer!);
      bounds.push([s.lat, s.lng]);
    });
  }

  for (const m of props.markers) {
    const selected = m.id === props.selectedId;
    if (m.approximate) {
      L.circle([m.lat, m.lng], { radius: 160, color: m.color, weight: 2, dashArray: '4 4', fillOpacity: 0.08 }).addTo(layer);
    }
    const marker =
      m.kind === 'dot'
        ? L.circleMarker([m.lat, m.lng], { radius: selected ? 9 : 6, color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 })
        : L.marker([m.lat, m.lng], { icon: pinIcon(m.color, m.label ?? '', selected), title: m.title, zIndexOffset: selected ? 1000 : 0 });
    marker.bindTooltip(m.title, { direction: 'top', offset: [0, -12] });
    marker.on('click', () => emit('select', m.id));
    marker.addTo(layer);
    if (m.kind !== 'dot' && m.fit !== false) bounds.push([m.lat, m.lng]);
  }

  if (props.you) {
    L.circleMarker([props.you.lat, props.you.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2f6fed', fillOpacity: 1 })
      .bindTooltip('你的位置', { direction: 'top' })
      .addTo(layer);
    bounds.push([props.you.lat, props.you.lng]);
  }

  if (fit && bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 16 });
  else if (fit && bounds.length === 1) map.setView(bounds[0], 16);
}

onMounted(() => {
  map = L.map(el.value!, { zoomControl: true }).setView([props.center.lat, props.center.lng], props.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('click', (e: L.LeafletMouseEvent) => emit('mapClick', { lat: e.latlng.lat, lng: e.latlng.lng }));
  draw(true);
});

watch(() => [props.markers, props.route, props.routeBuffer, props.you, props.selectedId], () => draw(false), { deep: true });
watch(() => props.fitKey, () => draw(true));

onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

defineExpose({
  flyTo(p: GeoPoint, zoom = 17) {
    map?.flyTo([p.lat, p.lng], zoom, { duration: 0.6 });
  },
  invalidate() {
    map?.invalidateSize();
  },
});
</script>

<template>
  <div ref="el" class="map" :style="{ height }" role="region" aria-label="地圖"></div>
</template>

<style scoped>
.map {
  width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  z-index: 0;
  background: var(--gray-100);
}
</style>
