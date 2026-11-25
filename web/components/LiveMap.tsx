'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface DriverPoint {
  id: number;
  full_name: string;
  plate: string;
  vehicle_model: string;
  status: string;
  balance: number;
  lat: number | null;
  lng: number | null;
}

interface TripPoint {
  id: number;
  passenger_phone: string;
  status: string;
  driver_plate: string | null;
  lat: number | null;
  lng: number | null;
}

export default function LiveMap({
  drivers,
  trips,
}: {
  drivers: DriverPoint[];
  trips: TripPoint[];
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const hasCenteredRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      const L = (await import('leaflet')).default;
      if (!mounted) return;

      const map = L.map(mapContainerRef.current).setView([6.2442, -75.5812], 13);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    initMap();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function renderMarkers() {
      if (!mapInstanceRef.current || !layerGroupRef.current) return;
      const L = (await import('leaflet')).default;

      layerGroupRef.current.clearLayers();
      const bounds: [number, number][] = [];

      drivers.forEach((drv) => {
        if (drv.lat == null || drv.lng == null) return;
        bounds.push([drv.lat, drv.lng]);

        const badgeColor =
          drv.status === 'AVAILABLE'
            ? '#10b981'
            : drv.status === 'BUSY'
            ? '#f59e0b'
            : '#64748b';

        const icon = L.divIcon({
          className: 'custom-taxi-marker',
          html: `<div style="background:${badgeColor};color:#fff;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;display:inline-flex;align-items:center;gap:3px;">🚕 ${drv.plate}</div>`,
          iconSize: [76, 26],
          iconAnchor: [38, 13],
        });

        L.marker([drv.lat, drv.lng], { icon })
          .bindPopup(
            `<div style="font-family:sans-serif;font-size:12px;line-height:1.4">
              <strong>🚕 ${drv.plate}</strong> (${drv.status})<br/>
              Conductor: ${drv.full_name}<br/>
              Vehículo: ${drv.vehicle_model}<br/>
              Saldo: $${Number(drv.balance).toLocaleString('es-CO')}
            </div>`
          )
          .addTo(layerGroupRef.current);
      });

      trips
        .filter((t) => t.status === 'SEARCHING' || t.status === 'ACTIVE')
        .forEach((trip) => {
          if (trip.lat == null || trip.lng == null) return;
          bounds.push([trip.lat, trip.lng]);

          const icon = L.divIcon({
            className: 'custom-passenger-marker',
            html: `<div style="background:#ef4444;color:#fff;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;">🙋 Viaje #${trip.id}</div>`,
            iconSize: [74, 26],
            iconAnchor: [37, 13],
          });

          L.marker([trip.lat, trip.lng], { icon })
            .bindPopup(
              `<div style="font-family:sans-serif;font-size:12px;line-height:1.4">
                <strong>🙋 Servicio #${trip.id}</strong><br/>
                Estado: ${trip.status}<br/>
                Pasajero: ${trip.passenger_phone}<br/>
                Taxi: ${trip.driver_plate || 'Buscando...'}
              </div>`
            )
            .addTo(layerGroupRef.current);
        });

      if (bounds.length > 0 && !hasCenteredRef.current) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        hasCenteredRef.current = true;
      }
    }

    renderMarkers();
  }, [drivers, trips]);

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div ref={mapContainerRef} className="h-full w-full z-0" />
      <div className="absolute bottom-3 left-3 z-[400] flex flex-wrap gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-md backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Ocupado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Desconectado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Pasajero en curso
        </span>
      </div>
    </div>
  );
}
