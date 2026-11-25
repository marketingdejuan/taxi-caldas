'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';

export interface CaldasZoneItem {
  id: number;
  name: string;
  zone_type: 'BARRIO' | 'VEREDA' | 'PUNTO_INTERES';
  aliases: string;
  surcharge: number;
  lat: number;
  lng: number;
}

const CALDAS_CENTER: [number, number] = [6.091, -75.6357];

export default function ZoneMapPicker({
  lat,
  lng,
  zones,
  selectedZoneId,
  onPickLocation,
  onSelectExistingZone,
}: {
  lat: number;
  lng: number;
  zones: CaldasZoneItem[];
  selectedZoneId: number | null;
  onPickLocation: (newLat: number, newLng: number) => void;
  onSelectExistingZone: (zone: CaldasZoneItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const activeMarkerRef = useRef<any>(null);
  const zonesLayerRef = useRef<any>(null);
  const onPickRef = useRef(onPickLocation);
  const onSelectRef = useRef(onSelectExistingZone);

  onPickRef.current = onPickLocation;
  onSelectRef.current = onSelectExistingZone;

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import('leaflet')).default;
      if (!mounted || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat || CALDAS_CENTER[0], lng || CALDAS_CENTER[1]],
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap • Barrios y Veredas Caldas',
        maxZoom: 19,
      }).addTo(map);

      const zonesGroup = L.layerGroup().addTo(map);
      zonesLayerRef.current = zonesGroup;

      const pinIcon = L.divIcon({
        className: 'zone-active-pin',
        html: `<div style="background:#f59e0b;color:#0f172a;font-weight:900;font-size:11px;padding:4px 9px;border-radius:999px;border:3px solid #0f172a;box-shadow:0 4px 14px rgba(0,0,0,0.45);white-space:nowrap;">📍 Punto Seleccionado</div>`,
        iconSize: [140, 28],
        iconAnchor: [70, 14],
      });

      const marker = L.marker([lat || CALDAS_CENTER[0], lng || CALDAS_CENTER[1]], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onPickRef.current(
          Number(pos.lat.toFixed(6)),
          Number(pos.lng.toFixed(6))
        );
      });

      map.on('click', (e: any) => {
        const clickedLat = Number(e.latlng.lat.toFixed(6));
        const clickedLng = Number(e.latlng.lng.toFixed(6));
        marker.setLatLng([clickedLat, clickedLng]);
        onPickRef.current(clickedLat, clickedLng);
      });

      mapRef.current = map;
      activeMarkerRef.current = marker;

      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 250);
    }

    initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        activeMarkerRef.current = null;
        zonesLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeMarkerRef.current && !isNaN(lat) && !isNaN(lng)) {
      activeMarkerRef.current.setLatLng([lat, lng]);
    }
    if (mapRef.current && !isNaN(lat) && !isNaN(lng)) {
      mapRef.current.panTo([lat, lng], { animate: true });
    }
  }, [lat, lng]);

  useEffect(() => {
    async function renderOtherZones() {
      if (!mapRef.current || !zonesLayerRef.current) return;
      const L = (await import('leaflet')).default;
      const group = zonesLayerRef.current;
      group.clearLayers();

      zones.forEach((z) => {
        if (z.id === selectedZoneId) return;
        const isVereda = z.zone_type === 'VEREDA';
        const bg = isVereda ? '#059669' : z.zone_type === 'BARRIO' ? '#2563eb' : '#7c3aed';

        const icon = L.divIcon({
          className: 'existing-zone-badge',
          html: `<div style="background:${bg};color:#fff;font-weight:700;font-size:10px;padding:2px 6px;border-radius:999px;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;opacity:0.9;">${z.name}</div>`,
          iconSize: [84, 20],
          iconAnchor: [42, 10],
        });

        const m = L.marker([Number(z.lat), Number(z.lng)], { icon }).addTo(group);
        m.on('click', () => {
          onSelectRef.current(z);
        });
      });
    }

    renderOtherZones();
  }, [zones, selectedZoneId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <Crosshair className="h-4 w-4 text-amber-500" />
          Haz clic en el mapa (o arrastra el pin amarillo) para fijar la ubicación exacta
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
            ● Barrio
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            ● Vereda
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ height: '380px', width: '100%' }}
        className="z-10 bg-slate-100"
      />
    </div>
  );
}
