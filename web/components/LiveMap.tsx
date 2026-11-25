'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { Navigation } from 'lucide-react';

interface Driver {
  id: number;
  full_name: string;
  plate: string;
  vehicle_model: string;
  status: string;
  lat: number | null;
  lng: number | null;
}

interface Trip {
  id: number;
  passenger_phone: string;
  passenger_name?: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
}

const CALDAS_CENTER: [number, number] = [6.091, -75.6357];

export default function LiveMap({
  drivers,
  trips,
}: {
  drivers: Driver[];
  trips: Trip[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    async function initLeaflet() {
      if (!containerRef.current || mapRef.current) return;
      const L = (await import('leaflet')).default;
      if (!mounted || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: CALDAS_CENTER,
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap • Taxi Caldas',
        maxZoom: 19,
      }).addTo(map);

      const group = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerGroupRef.current = group;

      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 250);
    }

    initLeaflet();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function renderMarkers() {
      if (!mapRef.current || !layerGroupRef.current) return;
      const L = (await import('leaflet')).default;
      const group = layerGroupRef.current;
      group.clearLayers();

      drivers.forEach((drv) => {
        if (drv.lat == null || drv.lng == null) return;
        const isAvailable = drv.status === 'AVAILABLE';
        const isBusy = drv.status === 'BUSY';
        const bgColor = isAvailable
          ? '#10b981'
          : isBusy
          ? '#f59e0b'
          : '#64748b';

        const icon = L.divIcon({
          className: 'custom-taxi-marker',
          html: `<div style="background:${bgColor};color:#fff;font-weight:800;font-size:10px;padding:3px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.35);white-space:nowrap;">🚕 ${drv.plate}</div>`,
          iconSize: [74, 24],
          iconAnchor: [37, 12],
        });

        L.marker([Number(drv.lat), Number(drv.lng)], { icon })
          .bindPopup(
            `<div style="font-family:sans-serif;font-size:12px;">
              <strong>🚕 ${drv.plate}</strong><br/>
              ${drv.full_name}<br/>
              <span style="color:#64748b;">${drv.vehicle_model}</span><br/>
              Estado: <strong>${isAvailable ? 'Disponible' : isBusy ? 'En carrera' : 'Desconectado'}</strong>
            </div>`
          )
          .addTo(group);
      });

      trips
        .filter((t) => t.status === 'SEARCHING' || t.status === 'ACTIVE')
        .forEach((trip) => {
          if (trip.lat == null || trip.lng == null) return;
          const icon = L.divIcon({
            className: 'custom-trip-marker',
            html: `<div style="background:#ef4444;color:#fff;font-weight:800;font-size:10px;padding:3px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 3px 10px rgba(239,68,68,0.45);white-space:nowrap;">🙋 #${trip.id}</div>`,
            iconSize: [54, 24],
            iconAnchor: [27, 12],
          });

          L.marker([Number(trip.lat), Number(trip.lng)], { icon })
            .bindPopup(
              `<div style="font-family:sans-serif;font-size:12px;">
                <strong>🙋 Servicio #${trip.id}</strong><br/>
                ${trip.passenger_name || 'Pasajero'} (${trip.passenger_phone})<br/>
                Estado: <strong>${trip.status}</strong>
              </div>`
            )
            .addTo(group);
        });
    }

    renderMarkers();
  }, [drivers, trips]);

  function centerCaldas() {
    if (mapRef.current) {
      mapRef.current.setView(CALDAS_CENTER, 14);
      mapRef.current.invalidateSize();
    }
  }

  const geolocatedDrivers = drivers.filter(
    (d) => d.lat != null && d.lng != null
  ).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Mapa Operativo en Vivo • Caldas, Antioquia
          </h2>
          <p className="text-[11px] text-slate-500">
            {geolocatedDrivers} vehículos con GPS activo •{' '}
            <span className="text-emerald-600 font-semibold">● Libre</span>{' '}
            <span className="text-amber-600 font-semibold">● Ocupado</span>{' '}
            <span className="text-red-600 font-semibold">● Pasajero</span>
          </p>
        </div>

        <button
          type="button"
          onClick={centerCaldas}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <Navigation className="h-3.5 w-3.5 text-amber-500" />
          Centrar en Caldas
        </button>
      </div>

      <div
        ref={containerRef}
        style={{ height: '460px', width: '100%' }}
        className="z-10 bg-slate-100"
      />
    </div>
  );
}
