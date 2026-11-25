import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { Pool } from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { ensureDatabaseSchema } from './initDb';
import {
  sendText,
  sendLocation,
  getMediaBase64,
  sendMedia,
  sendAudio,
} from './evolution';

dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

const uploadsDir = path.join(process.cwd(), 'uploads', 'drivers');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379/0', {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
});

db.on('error', (err) => console.error('⚠️ Error en pool PostgreSQL:', err.message));
redis.on('error', (err) => console.error('⚠️ Error en conexión Redis:', err.message));
process.on('uncaughtException', (err) => console.error('⚠️ Excepción no capturada:', err));
process.on('unhandledRejection', (err) => console.error('⚠️ Promesa rechazada:', err));

const INITIAL_RADIUS_METERS = 2500;
const EXPANDED_RADIUS_METERS = 5000;
const EXPAND_DELAY_MS = 45_000;
const FINAL_TIMEOUT_MS = 120_000;

interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

const KNOWN_LANDMARKS: Array<{ keys: string[]; lat: number; lng: number; label: string }> = [
  {
    keys: ['PARQUE DE CALDAS', 'PARQUE PRINCIPAL CALDAS', 'PARQUE CALDAS', 'CENTRO CALDAS'],
    lat: 6.0910,
    lng: -75.6357,
    label: 'Parque Principal de Caldas',
  },
  {
    keys: ['VARIANTE CALDAS', 'LA VARIANTE'],
    lat: 6.0962,
    lng: -75.6388,
    label: 'La Variante, Caldas',
  },
  {
    keys: ['LA MIEL', 'VEREDA LA MIEL'],
    lat: 6.0772,
    lng: -75.6295,
    label: 'La Miel, Caldas',
  },
  {
    keys: ['SALINAS', 'VEREDA SALINAS'],
    lat: 6.0745,
    lng: -75.6472,
    label: 'Vereda Salinas, Caldas',
  },
  {
    keys: ['LOCERIA', 'LA LOCERIA'],
    lat: 6.0994,
    lng: -75.6331,
    label: 'La Locería, Caldas',
  },
  {
    keys: ['HOSPITAL CALDAS', 'HOSPITAL SAN VICENTE CALDAS'],
    lat: 6.0885,
    lng: -75.6341,
    label: 'Hospital San Vicente de Paúl, Caldas',
  },
  {
    keys: ['ESTACION LA ESTRELLA', 'METRO LA ESTRELLA'],
    lat: 6.1578,
    lng: -75.6436,
    label: 'Estación Metro La Estrella',
  },
  {
    keys: ['MAYORCA', 'CENTRO COMERCIAL MAYORCA', 'SABANETA'],
    lat: 6.1614,
    lng: -75.6056,
    label: 'Centro Comercial Mayorca / Sabaneta',
  },
  {
    keys: ['ENVIGADO', 'PARQUE DE ENVIGADO'],
    lat: 6.1759,
    lng: -75.5917,
    label: 'Parque Principal de Envigado',
  },
  {
    keys: ['ITAGUI', 'PARQUE DE ITAGUI'],
    lat: 6.1719,
    lng: -75.6113,
    label: 'Parque de Itagüí',
  },
  {
    keys: ['POBLADO', 'EL POBLADO', 'PARQUE LLERAS', 'PROVENZA'],
    lat: 6.2088,
    lng: -75.5677,
    label: 'El Poblado, Medellín',
  },
  {
    keys: ['CENTRO MEDELLIN', 'PARQUE BERRIO', 'LA ALPUJARRA'],
    lat: 6.2442,
    lng: -75.5736,
    label: 'Centro de Medellín',
  },
  {
    keys: ['AEROPUERTO RIONEGRO', 'JOSE MARIA CORDOVA', 'AEROPUERTO JMC'],
    lat: 6.1645,
    lng: -75.4231,
    label: 'Aeropuerto José María Córdova',
  },
];

function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`;
}

function formatProperName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeColombianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length >= 12) return digits;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

function normalizeSearchKey(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¡!¿?.,]/g, '')
    .trim();
}

function isConsentAccepted(upperText: string): boolean {
  return ['ACEPTO', 'ACEPTAR', 'SI', 'SÍ', 'AUTORIZO', 'DE ACUERDO', 'OK', '1'].includes(
    upperText.trim()
  );
}

function isConsentRejected(upperText: string): boolean {
  return ['NO', 'NO ACEPTO', 'RECHAZO'].includes(upperText.trim());
}

function isQuoteIntent(upperText: string): boolean {
  const clean = normalizeSearchKey(upperText);
  return [
    'COTIZAR',
    'COTIZACION',
    'TARIFA',
    'TARIFAS',
    'PRECIO',
    'CUANTO VALE',
    'CUANTO CUESTA',
    'VALOR CARRERA',
    'SIMULAR',
  ].includes(clean) || clean.startsWith('COTIZAR ');
}

function isAmbiguousTaxiOrDriverIntent(upperText: string): boolean {
  const clean = normalizeSearchKey(upperText);
  if (!clean) return false;

  const exactMatches = [
    'TAXI',
    'SOY TAXI',
    'SOY TAXISTA',
    'SOY CONDUCTOR',
    'CONDUCTOR',
    'TAXISTA',
    'REGISTRO',
    'REGISTRARME',
    'AFILIAR',
    'AFILIARME',
    'TRABAJAR',
    'QUIERO TRABAJAR',
    'MANEJO TAXI',
    'TENGO TAXI',
    'UN TAXI',
  ];
  if (exactMatches.includes(clean)) return true;

  return /\b(SOY TAXI|SOY TAXISTA|SOY CONDUCTOR|REGISTRAR MI VEHICULO|AFILIAR TAXI|TRABAJAR EN TAXI)\b/.test(
    clean
  );
}

function isDriverWantingPassengerMode(upperText: string): boolean {
  const clean = normalizeSearchKey(upperText);
  return [
    'PEDIR TAXI',
    'NECESITO UN TAXI',
    'NECESITO TAXI',
    'QUIERO UN TAXI',
    'SOLICITAR TAXI',
    'MODO PASAJERO',
    'SOY PASAJERO',
    'PEDIR SERVICIO',
  ].includes(clean);
}

function isInvalidNameInput(text: string): boolean {
  const clean = text.trim();
  if (clean.length < 2 || clean.length > 45) return true;
  if (/[0-9@/:]/.test(clean)) return true;
  const blockedWords = [
    'HOLA',
    'HOLI',
    'BUENAS',
    'BUENOS DIAS',
    'BUENAS TARDES',
    'BUENAS NOCHES',
    'TAXI',
    'SOY TAXI',
    'SOY TAXISTA',
    'NECESITO',
    'NECESITO UN TAXI',
    'SERVICIO',
    'PIDO',
    'UBICACION',
    'CANCELAR',
    'AYUDA',
    'INFO',
    'OK',
    'SI',
    'NO',
    'ACEPTO',
    'COTIZAR',
  ];
  return blockedWords.includes(normalizeSearchKey(clean));
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolvePlaceToCoords(rawPlace: string): Promise<GeoPoint | null> {
  const cleanKey = normalizeSearchKey(rawPlace);
  if (!cleanKey || cleanKey.length < 3) return null;

  for (const lm of KNOWN_LANDMARKS) {
    if (lm.keys.some((k) => cleanKey === k || cleanKey.includes(k))) {
      return { lat: lm.lat, lng: lm.lng, label: lm.label };
    }
  }

  try {
    const query = `${rawPlace.trim()}, Caldas, Antioquia, Colombia`;
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        limit: 1,
        countrycodes: 'co',
      },
      headers: { 'User-Agent': 'TaxiCaldasDispatch/1.0' },
      timeout: 4500,
    });

    if (Array.isArray(res.data) && res.data.length > 0) {
      const hit = res.data[0];
      const shortName = String(hit.display_name || rawPlace)
        .split(',')
        .slice(0, 2)
        .join(',')
        .trim();
      return {
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        label: shortName || rawPlace.trim(),
      };
    }

    // Segundo intento en todo el Valle de Aburrá / Antioquia
    const fallbackRes = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: `${rawPlace.trim()}, Antioquia, Colombia`,
        format: 'json',
        limit: 1,
        countrycodes: 'co',
      },
      headers: { 'User-Agent': 'TaxiCaldasDispatch/1.0' },
      timeout: 4500,
    });

    if (Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
      const hit = fallbackRes.data[0];
      const shortName = String(hit.display_name || rawPlace)
        .split(',')
        .slice(0, 2)
        .join(',')
        .trim();
      return {
        lat: Number(hit.lat),
        lng: Number(hit.lon),
        label: shortName || rawPlace.trim(),
      };
    }
  } catch (err) {
    console.error('Aviso geocodificando lugar:', err);
  }

  return null;
}

async function calculateRouteQuote(
  origin: GeoPoint,
  destination: GeoPoint,
  tariffs: { baseFare: number; pricePerKm: number; minFare: number }
): Promise<{
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
}> {
  let distanceMeters = 0;
  let durationSeconds = 0;

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    const res = await axios.get(url, { timeout: 4500 });
    const route = res.data?.routes?.[0];
    if (route && route.distance > 0) {
      distanceMeters = Number(route.distance);
      durationSeconds = Number(route.duration || 0);
    }
  } catch {
    // Fallback vial urbano si OSRM no responde a tiempo
  }

  if (distanceMeters <= 0) {
    const straight = haversineMeters(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );
    distanceMeters = Math.max(500, Math.round(straight * 1.35));
    durationSeconds = Math.round(distanceMeters / 7.5);
  }

  const distanceKm = Number((distanceMeters / 1000).toFixed(1));
  const durationMinutes = Math.max(3, Math.round(durationSeconds / 60));
  const rawFare = tariffs.baseFare + distanceKm * tariffs.pricePerKm;
  const roundedFare = Math.round(rawFare / 100) * 100;
  const estimatedFare = Math.max(tariffs.minFare, roundedFare);

  return { distanceKm, durationMinutes, estimatedFare };
}

function calculateEtaEstimate(distanceMeters: number | null | undefined): {
  rangeText: string;
  distanceText: string;
} {
  if (
    distanceMeters == null ||
    isNaN(Number(distanceMeters)) ||
    Number(distanceMeters) <= 0
  ) {
    return {
      rangeText: '5 a 8 minutos',
      distanceText: 'Cerca de tu ubicación',
    };
  }
  const dist = Math.round(Number(distanceMeters));
  const minMins = Math.max(2, Math.round(dist / 420));
  const maxMins = minMins + 3;
  const distanceText =
    dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} metros`;

  return {
    rangeText: `${minMins} a ${maxMins} minutos`,
    distanceText,
  };
}

async function getRuntimeConfig() {
  try {
    const res = await db.query(`SELECT key, value FROM app_settings`);
    const map: Record<string, string> = {};
    for (const r of res.rows) map[r.key] = r.value;

    const centralPhone =
      map.central_phone || process.env.CENTRAL_PHONE || '573133336835';
    const adminRaw =
      map.admin_phones || process.env.ADMIN_PHONES || centralPhone;
    const adminPhones = adminRaw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const tripCommission = Number(
      map.trip_commission || process.env.TRIP_COMMISSION || 500
    );
    const baseFare = Number(map.base_fare || 5900);
    const pricePerKm = Number(map.price_per_km || 2400);
    const minFare = Number(map.min_fare || 8300);

    return {
      centralPhone,
      adminPhones,
      tripCommission,
      baseFare,
      pricePerKm,
      minFare,
    };
  } catch {
    const centralPhone = process.env.CENTRAL_PHONE || '573133336835';
    return {
      centralPhone,
      adminPhones: [centralPhone],
      tripCommission: Number(process.env.TRIP_COMMISSION || 500),
      baseFare: 5900,
      pricePerKm: 2400,
      minFare: 8300,
    };
  }
}

async function findAvailableDriversInRadius(
  lng: number,
  lat: number,
  radiusMeters: number,
  minBalance: number,
  excludeDriverIds: number[] = [],
  excludePhone = ''
) {
  const res = await db.query(
    `SELECT id, phone, full_name,
            ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)) AS distance_meters
     FROM drivers
     WHERE status = 'AVAILABLE'
       AND is_verified = TRUE
       AND approval_status = 'APPROVED'
       AND balance >= $3
       AND phone <> $6
       AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
       AND NOT (id = ANY($5::int[]))
     ORDER BY distance_meters ASC
     LIMIT 10`,
    [lng, lat, minBalance, radiusMeters, excludeDriverIds, excludePhone]
  );
  return res.rows;
}

async function broadcastTripOffer(
  drivers: Array<{ id: number; phone: string; distance_meters: string | number }>,
  tripInfo: {
    id: number;
    dropoffAddress?: string | null;
    distanceKm?: number | null;
    estimatedFare?: number | null;
  },
  tripCommission: number,
  isExpandedRing = false
) {
  const header = isExpandedRing
    ? '🚖 *CENTRAL TAXI CALDAS • NUEVO SERVICIO (ZONA AMPLIADA)*'
    : '🚖 *CENTRAL TAXI CALDAS • NUEVO SERVICIO DISPONIBLE*';

  const routeDetails =
    tripInfo.dropoffAddress && tripInfo.estimatedFare
      ? `\n🏁 *Destino (B):* ${tripInfo.dropoffAddress}` +
        `\n🛣️ *Recorrido aprox.:* ${tripInfo.distanceKm} km` +
        `\n💵 *Valor aproximado servicio:* *${formatCOP(tripInfo.estimatedFare)}*`
      : `\n🏁 *Destino (B):* Por confirmar con el usuario`;

  for (const drv of drivers) {
    const currentTrip = await db.query(`SELECT status FROM trips WHERE id = $1`, [
      tripInfo.id,
    ]);
    if (currentTrip.rows[0]?.status !== 'SEARCHING') break;

    await redis.set(`offer:${drv.phone}`, tripInfo.id, 'EX', 120);
    await sendText(
      drv.phone,
      `${header}\n\n` +
        `📍 *Recogida (A):* a *${drv.distance_meters} metros* de ti` +
        `${routeDetails}\n` +
        `💸 *Comisión central:* ${formatCOP(tripCommission)}\n\n` +
        `Responde *1* o *YO* para tomarlo.`
    );
    await new Promise((r) => setTimeout(r, 600));
  }
}

function scheduleExpandedSearch(
  tripInfo: {
    id: number;
    dropoffAddress?: string | null;
    distanceKm?: number | null;
    estimatedFare?: number | null;
  },
  passengerPhone: string,
  passengerName: string | null,
  lng: number,
  lat: number,
  tripCommission: number,
  initialAlertedIds: number[]
) {
  const nameTag = passengerName ? ` *${passengerName}*` : '';

  setTimeout(async () => {
    try {
      const check = await db.query(`SELECT status FROM trips WHERE id = $1`, [
        tripInfo.id,
      ]);
      if (check.rows[0]?.status !== 'SEARCHING') return;

      const extraDrivers = await findAvailableDriversInRadius(
        lng,
        lat,
        EXPANDED_RADIUS_METERS,
        tripCommission,
        initialAlertedIds,
        passengerPhone
      );

      if (extraDrivers.length > 0) {
        await sendText(
          passengerPhone,
          `🚖 *CENTRAL TAXI CALDAS:*\n🔎 Seguimos buscando tu taxi${nameTag}. Ampliamos el radio a *5 km* y acabamos de alertar a *${extraDrivers.length} conductores* adicionales...`
        );
        await broadcastTripOffer(extraDrivers, tripInfo, tripCommission, true);
      } else if (initialAlertedIds.length > 0) {
        await sendText(
          passengerPhone,
          `🚖 *CENTRAL TAXI CALDAS:*\n⏳ Seguimos esperando confirmación de los conductores cercanos a tu zona${nameTag}...\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
        );
      }
    } catch (err) {
      console.error(`Error en expansión de radio viaje #${tripInfo.id}:`, err);
    }
  }, EXPAND_DELAY_MS);

  setTimeout(async () => {
    try {
      const expired = await db.query(
        `UPDATE trips
         SET status = 'CANCELLED', cancelled_by = 'TIMEOUT', cancelled_at = NOW()
         WHERE id = $1 AND status = 'SEARCHING'
         RETURNING id`,
        [tripInfo.id]
      );
      if (expired.rows.length > 0) {
        await sendText(
          passengerPhone,
          `🚖 *CENTRAL TAXI CALDAS:*\n😔 Lo sentimos${nameTag}, ningún conductor pudo tomar tu solicitud en este momento. Por favor envíanos nuevamente tu *ubicación actual* para intentar de nuevo.`
        );
      }
    } catch (err) {
      console.error(`Error cerrando timeout viaje #${tripInfo.id}:`, err);
    }
  }, FINAL_TIMEOUT_MS);
}

async function dispatchTripFromPickup(params: {
  passengerPhone: string;
  passengerName: string | null;
  pickup: GeoPoint;
  dropoff?: GeoPoint | null;
  distanceKm?: number | null;
  estimatedFare?: number | null;
  tripCommission: number;
}) {
  const {
    passengerPhone,
    passengerName,
    pickup,
    dropoff,
    distanceKm,
    estimatedFare,
    tripCommission,
  } = params;

  const existingCheck = await db.query(
    `SELECT id FROM trips WHERE passenger_phone = $1 AND status IN ('SEARCHING', 'ACTIVE') LIMIT 1`,
    [passengerPhone]
  );
  if (existingCheck.rows.length > 0) return;

  const reqLock = await redis.set(
    `passenger:req_lock:${passengerPhone}`,
    '1',
    'EX',
    5,
    'NX'
  );
  if (!reqLock) return;

  let nearbyDrivers = await findAvailableDriversInRadius(
    pickup.lng,
    pickup.lat,
    INITIAL_RADIUS_METERS,
    tripCommission,
    [],
    passengerPhone
  );
  let usedExpandedImmediately = false;

  if (nearbyDrivers.length === 0) {
    nearbyDrivers = await findAvailableDriversInRadius(
      pickup.lng,
      pickup.lat,
      EXPANDED_RADIUS_METERS,
      tripCommission,
      [],
      passengerPhone
    );
    usedExpandedImmediately = true;
  }

  if (nearbyDrivers.length === 0) {
    await sendText(
      passengerPhone,
      `🚖 *CENTRAL TAXI CALDAS:*\n😔 Lo sentimos${passengerName ? ` *${passengerName}*` : ''}, no encontramos taxis disponibles a menos de 5 km de tu ubicación en este momento. Intenta nuevamente en un par de minutos.`
    );
    return;
  }

  let tripId: number;
  try {
    const newTrip = await db.query(
      `INSERT INTO trips (
         passenger_phone, pickup_location, pickup_address,
         dropoff_location, dropoff_address, distance_km, estimated_fare
       )
       VALUES (
         $1,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
         $4,
         CASE WHEN $5::double precision IS NOT NULL AND $6::double precision IS NOT NULL
              THEN ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography
              ELSE NULL END,
         $7,
         $8,
         $9
       )
       RETURNING id`,
      [
        passengerPhone,
        pickup.lng,
        pickup.lat,
        pickup.label,
        dropoff ? dropoff.lng : null,
        dropoff ? dropoff.lat : null,
        dropoff ? dropoff.label : null,
        distanceKm ?? null,
        estimatedFare ?? null,
      ]
    );
    tripId = newTrip.rows[0].id;
    await db.query(
      `UPDATE passengers SET trips_count = trips_count + 1 WHERE phone = $1`,
      [passengerPhone]
    );
  } catch (insertErr: any) {
    if (insertErr?.code === '23505') return;
    throw insertErr;
  }

  const greetingPrefix = passengerName
    ? `🚖 *CENTRAL TAXI CALDAS:*\n🔎 ¡Listo *${passengerName}*! Solicitud *#${tripId}* creada.`
    : `🚖 *CENTRAL TAXI CALDAS:*\n🔎 Solicitud *#${tripId}* creada.`;

  const fareLine =
    dropoff && estimatedFare
      ? `\n🏁 *Destino (B):* ${dropoff.label}\n💵 *Valor aproximado:* *${formatCOP(estimatedFare)}* (${distanceKm} km)`
      : '';

  await sendText(
    passengerPhone,
    usedExpandedImmediately
      ? `${greetingPrefix}${fareLine}\n\nEstamos alertando a *${nearbyDrivers.length} conductores* en un radio de *5 km*...\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
      : `${greetingPrefix}${fareLine}\n\nEstamos alertando a *${nearbyDrivers.length} conductores* cercanos a tu zona...\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
  );

  const tripInfo = {
    id: tripId,
    dropoffAddress: dropoff?.label || null,
    distanceKm: distanceKm ?? null,
    estimatedFare: estimatedFare ?? null,
  };

  await broadcastTripOffer(
    nearbyDrivers,
    tripInfo,
    tripCommission,
    usedExpandedImmediately
  );

  const alertedIds = nearbyDrivers.map((d) => d.id);
  scheduleExpandedSearch(
    tripInfo,
    passengerPhone,
    passengerName,
    pickup.lng,
    pickup.lat,
    tripCommission,
    alertedIds
  );
}

app.get(['/', '/health'], (_req, res) =>
  res.json({ ok: true, service: 'taxi-caldas-backend' })
);

// Endpoint interno para que el operador de Central Taxi Caldas envíe mensajes en un viaje
app.post('/admin/send-trip-message', async (req, res) => {
  try {
    const { tripId, target, message } = req.body;
    const numericId = Number(tripId);
    const cleanMsg = String(message || '').trim();

    if (!numericId || !cleanMsg) {
      res.status(400).json({ error: 'Falta viaje o mensaje' });
      return;
    }

    const tripRes = await db.query(
      `SELECT t.id, t.passenger_phone, d.phone AS driver_phone
       FROM trips t
       LEFT JOIN drivers d ON t.driver_id = d.id
       WHERE t.id = $1`,
      [numericId]
    );
    const trip = tripRes.rows[0];
    if (!trip) {
      res.status(404).json({ error: 'Viaje no encontrado' });
      return;
    }

    const formatted = `🚖 *CENTRAL TAXI CALDAS:* ${cleanMsg}`;

    if ((target === 'PASSENGER' || target === 'BOTH') && trip.passenger_phone) {
      await sendText(trip.passenger_phone, formatted);
    }
    if ((target === 'DRIVER' || target === 'BOTH') && trip.driver_phone) {
      await sendText(trip.driver_phone, formatted);
    }

    await db.query(
      `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content)
       VALUES ($1, 'CENTRAL', 'CENTRAL_ADMIN', $2, 'TEXT', $3)`,
      [numericId, target || 'BOTH', cleanMsg]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /admin/send-trip-message:', err);
    res.status(500).json({ error: 'Error enviando mensaje de central' });
  }
});

// Endpoint interno para borrar perfiles (conductores o clientes) y limpiar sesiones Redis
app.post('/admin/delete-profile', async (req, res) => {
  try {
    const { type, id } = req.body;
    const numericId = Number(id);
    if (!numericId || !['DRIVER', 'PASSENGER'].includes(type)) {
      res.status(400).json({ error: 'Parámetros inválidos' });
      return;
    }

    if (type === 'DRIVER') {
      const drvRes = await db.query(`SELECT * FROM drivers WHERE id = $1`, [
        numericId,
      ]);
      const drv = drvRes.rows[0];
      if (!drv) {
        res.status(404).json({ error: 'Conductor no encontrado' });
        return;
      }

      await redis.del(
        `reg:${drv.phone}`,
        `offer:${drv.phone}`,
        `session:${drv.phone}`,
        `driver_passenger_mode:${drv.phone}`,
        `role_confirm:${drv.phone}`,
        `quote:${drv.phone}`,
        `pending_pickup:${drv.phone}`
      );

      for (const fileRel of [drv.profile_photo_path, drv.doc_photo_path]) {
        if (fileRel) {
          const abs = path.join(process.cwd(), fileRel);
          if (fs.existsSync(abs)) {
            try {
              fs.unlinkSync(abs);
            } catch {}
          }
        }
      }

      await db.query(`DELETE FROM wallet_transactions WHERE driver_id = $1`, [
        numericId,
      ]);
      await db.query(`UPDATE trips SET driver_id = NULL WHERE driver_id = $1`, [
        numericId,
      ]);
      await db.query(`DELETE FROM drivers WHERE id = $1`, [numericId]);

      res.json({ ok: true });
      return;
    }

    const passRes = await db.query(`SELECT * FROM passengers WHERE id = $1`, [
      numericId,
    ]);
    const pass = passRes.rows[0];
    if (!pass) {
      res.status(404).json({ error: 'Cliente no encontrado' });
      return;
    }

    await redis.del(
      `consent_pending:${pass.phone}`,
      `ask_name:${pass.phone}`,
      `rate:${pass.phone}`,
      `session:${pass.phone}`,
      `role_confirm:${pass.phone}`,
      `quote:${pass.phone}`,
      `pending_pickup:${pass.phone}`
    );
    await db.query(`DELETE FROM passengers WHERE id = $1`, [numericId]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /admin/delete-profile:', err);
    res.status(500).json({ error: 'Error eliminando perfil' });
  }
});

// Endpoint público para registro web de taxistas (/registro-taxista)
app.post('/public/driver-register', async (req, res) => {
  try {
    const {
      fullName,
      phone,
      plate,
      vehicleModel,
      profilePhotoBase64,
      docPhotoBase64,
      dataConsent,
    } = req.body;

    if (!dataConsent) {
      res.status(400).json({
        error: 'Debes autorizar el tratamiento de datos personales (Ley 1581).',
      });
      return;
    }

    const cleanPhone = normalizeColombianPhone(String(phone || ''));
    const cleanPlate = String(plate || '')
      .toUpperCase()
      .replace(/\s+/g, '');
    const formattedName = formatProperName(String(fullName || ''));
    const cleanModel = String(vehicleModel || '').trim();

    if (
      formattedName.length < 3 ||
      cleanPhone.length < 10 ||
      cleanPlate.length < 5 ||
      cleanModel.length < 3 ||
      !profilePhotoBase64 ||
      !docPhotoBase64
    ) {
      res.status(400).json({
        error:
          'Completa todos los campos y adjunta tanto tu foto de perfil como la foto de tus documentos.',
      });
      return;
    }

    const dupPhone = await db.query(`SELECT id FROM drivers WHERE phone = $1`, [
      cleanPhone,
    ]);
    if (dupPhone.rows.length > 0) {
      res.status(409).json({
        error: 'Este número de WhatsApp ya tiene un registro de conductor.',
      });
      return;
    }

    const dupPlate = await db.query(
      `SELECT id FROM drivers WHERE UPPER(plate) = $1`,
      [cleanPlate]
    );
    if (dupPlate.rows.length > 0) {
      res.status(409).json({
        error: `La placa ${cleanPlate} ya se encuentra registrada en el sistema.`,
      });
      return;
    }

    const stripBase64 = (b64: string) =>
      b64.includes(',') ? b64.split(',')[1] : b64;

    const rawProfileB64 = stripBase64(profilePhotoBase64);
    const rawDocB64 = stripBase64(docPhotoBase64);

    const profileFileName = `profile_${cleanPhone}_${Date.now()}.jpg`;
    const docFileName = `doc_${cleanPhone}_${Date.now()}.jpg`;
    const profileRelativePath = `uploads/drivers/${profileFileName}`;
    const docRelativePath = `uploads/drivers/${docFileName}`;

    fs.writeFileSync(
      path.join(process.cwd(), profileRelativePath),
      Buffer.from(rawProfileB64, 'base64')
    );
    fs.writeFileSync(
      path.join(process.cwd(), docRelativePath),
      Buffer.from(rawDocB64, 'base64')
    );

    await db.query(
      `INSERT INTO drivers (
         phone, full_name, plate, vehicle_model, status, is_verified,
         approval_status, balance, profile_photo_path, doc_photo_path,
         data_consent, data_consent_at
       )
       VALUES ($1, $2, $3, $4, 'OFFLINE', FALSE, 'PENDING', 0, $5, $6, TRUE, NOW())`,
      [
        cleanPhone,
        formattedName,
        cleanPlate,
        cleanModel,
        profileRelativePath,
        docRelativePath,
      ]
    );

    const { adminPhones } = await getRuntimeConfig();

    try {
      await sendText(
        cleanPhone,
        `🚖 *CENTRAL TAXI CALDAS:*\n✅ *¡Solicitud recibida, ${formattedName}!*\n\n🔢 Placa: *${cleanPlate}*\n🚕 Vehículo: *${cleanModel}*\n📋 Habeas Data: *Autorizado*\n\nRecibimos tu formulario web con foto de perfil y documentos. Te avisaremos por aquí en cuanto tu cuenta sea aprobada.`
      );
    } catch (e) {
      console.error('Aviso enviando confirmación WhatsApp web register:', e);
    }

    const adminPhone = adminPhones[0];
    if (adminPhone) {
      try {
        const summary = `🚖 *CENTRAL TAXI CALDAS • NUEVO TAXISTA (WEB)*\n\n👤 Nombre: *${formattedName}*\n📱 Teléfono: *${cleanPhone}*\n🔢 Placa: *${cleanPlate}*\n🚕 Vehículo: *${cleanModel}*\n\nPara aprobarlo responde:\n*/aprobar ${cleanPlate} 5000*`;
        await sendMedia(
          adminPhone,
          'image',
          rawDocB64,
          'image/jpeg',
          summary
        );
      } catch (e) {
        console.error('Aviso notificando admin web register:', e);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /public/driver-register:', err);
    res.status(500).json({ error: 'Error procesando el registro web' });
  }
});

app.post(['/webhook/whatsapp', '/webhook/whatsapp/:event'], async (req, res) => {
  res.sendStatus(200);

  try {
    const { event, data } = req.body;
    if (
      String(event || '').toLowerCase() !== 'messages.upsert' ||
      !data?.message
    ) {
      return;
    }

    const msgId = data.key?.id;
    if (msgId) {
      const isFirst = await redis.set(`dedup:msg:${msgId}`, '1', 'EX', 60, 'NX');
      if (!isFirst) return;
    }

    const rawJid: string = data.key?.remoteJid || '';
    if (rawJid.includes('@g.us') || rawJid === 'status@broadcast') return;

    const altJid: string = data.key?.remoteJidAlt || '';
    const effectiveJid = rawJid.endsWith('@lid') && altJid ? altJid : rawJid;
    const from = effectiveJid.endsWith('@lid')
      ? effectiveJid
      : effectiveJid.replace('@s.whatsapp.net', '');

    const rawMsg = data.message;
    const msg =
      rawMsg?.ephemeralMessage?.message ||
      rawMsg?.viewOnceMessage?.message ||
      rawMsg?.viewOnceMessageV2?.message ||
      rawMsg;

    const text = (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      ''
    ).trim();
    const upperText = text.toUpperCase();
    const location = msg.locationMessage || msg.liveLocationMessage;
    const imageMsg = msg.imageMessage;
    const videoMsg = msg.videoMessage;
    const audioMsg = msg.audioMessage;
    const docMsg = msg.documentMessage;
    const pushName: string | null = data.pushName || null;

    const {
      centralPhone,
      adminPhones,
      tripCommission,
      baseFare,
      pricePerKm,
      minFare,
    } = await getRuntimeConfig();

    const isFromMe = Boolean(data.key?.fromMe);
    const isAdmin = adminPhones.includes(from.replace('@lid', ''));
    const isSlashCommand = text.startsWith('/');

    if (isFromMe && !(isAdmin && isSlashCommand)) return;

    console.log(
      `👤 De: ${from} (${pushName || 'Sin pushName'}) | Texto: "${text}" | GPS: ${Boolean(location)}`
    );

    // 0. COMANDOS ADMINISTRATIVOS
    if (isAdmin && isSlashCommand) {
      const parts = text.split(/\s+/);
      const adminCmd = parts[0].toUpperCase();

      if (adminCmd === '/PENDIENTES') {
        const pending = await db.query(
          `SELECT id, full_name, plate, vehicle_model, phone FROM drivers WHERE approval_status = 'PENDING' ORDER BY created_at ASC`
        );
        if (pending.rows.length === 0) {
          await sendText(from, '🚖 *CENTRAL TAXI CALDAS:*\n✅ No hay conductores pendientes por aprobar.');
          return;
        }
        const list = pending.rows
          .map(
            (d) =>
              `• *${d.plate}* - ${d.full_name} (${d.vehicle_model}) | Tel: ${d.phone}`
          )
          .join('\n');
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS • PENDIENTES:*\n\n${list}\n\nPara aprobar escribe:\n*/aprobar PLACA BONO*\nEj: /aprobar ${pending.rows[0].plate} 5000`
        );
        return;
      }

      if (adminCmd === '/APROBAR') {
        const plate = (parts[1] || '').toUpperCase();
        const bonus = Math.max(0, Number(parts[2] || 0));

        if (!plate) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Uso correcto: */aprobar PLACA [BONO_INICIAL]*\nEj: /aprobar ABC-123 5000'
          );
          return;
        }

        const drvRes = await db.query(
          `UPDATE drivers
           SET is_verified = TRUE, approval_status = 'APPROVED', balance = balance + $1
           WHERE UPPER(plate) = $2
           RETURNING *`,
          [bonus, plate]
        );

        if (drvRes.rows.length === 0) {
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n❌ No se encontró ningún conductor con placa *${plate}*.`
          );
          return;
        }

        const drv = drvRes.rows[0];
        if (bonus > 0) {
          await db.query(
            `INSERT INTO wallet_transactions (driver_id, amount, type, description) VALUES ($1, $2, 'BONUS', 'Bono de bienvenida al aprobar cuenta')`,
            [drv.id, bonus]
          );
        }

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n✅ Conductor *${drv.full_name}* (*${drv.plate}*) aprobado.\n💰 Saldo actual: *${formatCOP(drv.balance)}*`
        );
        await sendText(
          drv.phone,
          `🚖 *CENTRAL TAXI CALDAS:*\n🎉 *¡Tu cuenta ha sido aprobada, ${drv.full_name}!*\n\n🚕 Placa: *${drv.plate}*\n💰 Saldo disponible: *${formatCOP(drv.balance)}*\n\nPara empezar a recibir carreras, envía tu *ubicación actual* (📎 -> Ubicación).`
        );
        return;
      }

      if (adminCmd === '/RECARGAR') {
        const plate = (parts[1] || '').toUpperCase();
        const amount = Number(parts[2] || 0);

        if (!plate || isNaN(amount) || amount <= 0) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Uso correcto: */recargar PLACA MONTO*\nEj: /recargar ABC-123 20000'
          );
          return;
        }

        const drvRes = await db.query(
          `UPDATE drivers SET balance = balance + $1 WHERE UPPER(plate) = $2 RETURNING *`,
          [amount, plate]
        );

        if (drvRes.rows.length === 0) {
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n❌ No se encontró ningún conductor con placa *${plate}*.`
          );
          return;
        }

        const drv = drvRes.rows[0];
        await db.query(
          `INSERT INTO wallet_transactions (driver_id, amount, type, description) VALUES ($1, $2, 'TOPUP', 'Recarga de saldo prepago')`,
          [drv.id, amount]
        );

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n✅ Recarga exitosa de *${formatCOP(amount)}* a *${drv.full_name}* (*${drv.plate}*).\n💰 Nuevo saldo: *${formatCOP(drv.balance)}*`
        );
        await sendText(
          drv.phone,
          `🚖 *CENTRAL TAXI CALDAS:*\n💳 *¡Recarga acreditada, ${drv.full_name}!*\n\n➕ Valor recargado: *${formatCOP(amount)}*\n💰 Nuevo saldo disponible: *${formatCOP(drv.balance)}*\n\nEnvía tu *ubicación* (📎 -> Ubicación) o escribe *ACTIVO* para recibir servicios.`
        );
        return;
      }
    }

    // 1. MODO PROXY ENMASCARADO (VIAJE ACTIVO) CON TÍTULOS EXPLÍCITOS
    const activeSessionRaw = await redis.get(`session:${from}`);
    if (activeSessionRaw) {
      const session = JSON.parse(activeSessionRaw);

      if (upperText === 'SOS' || upperText.startsWith('SOS ')) {
        await db.query(
          `INSERT INTO sos_alerts (trip_id, triggered_by, trigger_phone) VALUES ($1, $2, $3)`,
          [session.tripId, session.role, from]
        );

        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content)
           VALUES ($1, $2, $3, 'CENTRAL_ADMIN', 'SOS', $4)`,
          [
            session.tripId,
            session.role,
            from,
            `🚨 ALERTA SOS ACTIVADA: ${text}`,
          ]
        );

        const detailRes = await db.query(
          `SELECT
             t.id AS trip_id,
             t.passenger_phone,
             COALESCE(p.full_name, dp.full_name) AS passenger_name,
             ST_Y(t.pickup_location::geometry) AS pickup_lat,
             ST_X(t.pickup_location::geometry) AS pickup_lng,
             d.full_name AS driver_name,
             d.phone AS driver_phone,
             d.plate AS driver_plate,
             d.vehicle_model,
             ST_Y(d.location::geometry) AS drv_lat,
             ST_X(d.location::geometry) AS drv_lng
           FROM trips t
           LEFT JOIN drivers d ON t.driver_id = d.id
           LEFT JOIN passengers p ON t.passenger_phone = p.phone
           LEFT JOIN drivers dp ON t.passenger_phone = dp.phone
           WHERE t.id = $1`,
          [session.tripId]
        );

        const logsRes = await db.query(
          `SELECT sender_role, content
           FROM chat_logs
           WHERE trip_id = $1
           ORDER BY created_at DESC
           LIMIT 6`,
          [session.tripId]
        );

        const info = detailRes.rows[0];
        const recentChat =
          logsRes.rows.length > 0
            ? logsRes.rows
                .reverse()
                .map((l) => {
                  const who =
                    l.sender_role === 'PASSENGER'
                      ? 'USUARIO'
                      : l.sender_role === 'DRIVER'
                      ? 'TAXISTA'
                      : 'CENTRAL TAXI CALDAS';
                  return `• ${who}: ${l.content}`;
                })
                .join('\n')
            : 'Sin mensajes previos.';

        const whoLabel =
          session.role === 'PASSENGER' ? '👤 USUARIO' : '🚕 TAXISTA';
        const pickupMap = info?.pickup_lat
          ? `https://maps.google.com/?q=${info.pickup_lat},${info.pickup_lng}`
          : 'No disponible';
        const driverMap = info?.drv_lat
          ? `https://maps.google.com/?q=${info.drv_lat},${info.drv_lng}`
          : 'No disponible';

        const sosReport =
          `🚖 *CENTRAL TAXI CALDAS • ALERTA SOS* 🆘\n\n` +
          `Activada por: *${whoLabel}* (*${from}*)\n` +
          `Servicio ID: *#${session.tripId}*\n\n` +
          `🚕 *Vehículo:* ${info?.vehicle_model || 'N/A'} | Placa: *${info?.driver_plate || 'N/A'}*\n` +
          `👨‍✈️ *Taxista:* ${info?.driver_name || 'N/A'} (Tel: ${info?.driver_phone || 'N/A'})\n` +
          `🙋 *Usuario:* ${info?.passenger_name || 'Sin nombre'} (${info?.passenger_phone || 'N/A'})\n\n` +
          `📍 *Punto de recogida:* ${pickupMap}\n` +
          `🛰️ *Último GPS taxi:* ${driverMap}\n\n` +
          `💬 *Últimos mensajes del chat:*\n${recentChat}`;

        for (const adminPhone of adminPhones) {
          await sendText(adminPhone, sosReport);
        }

        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n🆘 *Alerta SOS recibida.* Ya notificamos de inmediato al equipo de monitoreo con los datos del vehículo, ubicación GPS y registro del viaje.'
        );
        return;
      }

      if (upperText === 'CANCELAR') {
        await redis.del(
          `session:${from}`,
          `session:${session.peerPhone}`,
          `trip:lock:${session.tripId}`
        );

        if (session.role === 'PASSENGER') {
          const client = await db.connect();
          let refundedDriver: any = null;
          try {
            await client.query('BEGIN');
            await client.query(
              `UPDATE trips SET status = 'CANCELLED', cancelled_by = 'PASSENGER', cancelled_at = NOW() WHERE id = $1`,
              [session.tripId]
            );
            const drvRes = await client.query(
              `UPDATE drivers SET status = 'AVAILABLE', balance = balance + $1 WHERE phone = $2 RETURNING id, balance`,
              [tripCommission, session.peerPhone]
            );
            refundedDriver = drvRes.rows[0];
            if (refundedDriver) {
              await client.query(
                `INSERT INTO wallet_transactions (driver_id, amount, type, trip_id, description) VALUES ($1, $2, 'REFUND', $3, $4)`,
                [
                  refundedDriver.id,
                  tripCommission,
                  session.tripId,
                  `Reembolso cancelación pasajero #${session.tripId}`,
                ]
              );
            }
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }

          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n❌ *Has cancelado tu servicio.* Si necesitas un taxi más adelante, envíanos tu ubicación.'
          );
          await sendText(
            session.peerPhone,
            `🚖 *CENTRAL TAXI CALDAS:*\n⚠️ *El usuario canceló el servicio.*\n💸 Se reembolsaron *+${formatCOP(tripCommission)}* a tu billetera (Saldo: *${formatCOP(refundedDriver?.balance || 0)}*).\n🟢 Quedas *DISPONIBLE* para nuevas carreras.`
          );
        } else {
          await db.query(
            `UPDATE trips SET status = 'CANCELLED', cancelled_by = 'DRIVER', cancelled_at = NOW() WHERE id = $1`,
            [session.tripId]
          );
          await db.query(`UPDATE drivers SET status = 'AVAILABLE' WHERE phone = $1`, [
            from,
          ]);

          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n❌ *Has cancelado el servicio.* Quedas *DISPONIBLE* para nuevas carreras.'
          );
          await sendText(
            session.peerPhone,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ *El taxista canceló el servicio.* Disculpa las molestias.\n\nSi aún necesitas taxi, envíanos nuevamente tu *ubicación actual* (📎 -> Ubicación) para asignarte otro vehículo.'
          );
        }
        return;
      }

      if (session.role === 'DRIVER' && upperText === 'FIN') {
        await db.query(
          `UPDATE trips SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
          [session.tripId]
        );
        const drvRes = await db.query(
          `UPDATE drivers SET status = 'AVAILABLE' WHERE phone = $1 RETURNING id, full_name, plate`,
          [from]
        );
        const drv = drvRes.rows[0];

        await redis.del(
          `session:${from}`,
          `session:${session.peerPhone}`,
          `trip:lock:${session.tripId}`
        );

        if (drv) {
          await redis.set(
            `rate:${session.peerPhone}`,
            JSON.stringify({
              tripId: session.tripId,
              driverId: drv.id,
              driverName: drv.full_name,
              plate: drv.plate,
            }),
            'EX',
            3600
          );
        }

        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n✅ Servicio finalizado. Quedas *DISPONIBLE* para nuevas carreras.'
        );
        await sendText(
          session.peerPhone,
          `🚖 *CENTRAL TAXI CALDAS:*\n🏁 *¡Tu viaje ha finalizado!*\n\n¿Cómo calificarías el servicio de *${drv?.full_name || 'tu taxista'}* (*${drv?.plate || ''}*)?\n\nResponde con un número del *1* al *5*:\n⭐⭐⭐⭐⭐ *5* - Excelente\n⭐⭐⭐⭐ *4* - Muy bueno\n⭐⭐⭐ *3* - Regular\n⭐⭐ *2* - Malo\n⭐ *1* - Muy malo\n\n_(O escribe *OMITIR* para saltar)_`
        );
        return;
      }

      // Título explícito: 👤 USUARIO vs 🚕 TAXISTA
      const roleTitle =
        session.role === 'PASSENGER'
          ? `👤 *USUARIO${session.senderName ? ` (${session.senderName})` : ''}:*`
          : `🚕 *TAXISTA${session.senderName ? ` (${session.senderName})` : ''}:*`;

      if (text) {
        await sendText(session.peerPhone, `${roleTitle}\n${text}`);
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'TEXT', $5)`,
          [session.tripId, session.role, from, session.peerPhone, text]
        );
      } else if (imageMsg) {
        const media = await getMediaBase64(data);
        const caption = imageMsg.caption
          ? `${roleTitle}\n${imageMsg.caption}`
          : roleTitle;
        await sendMedia(
          session.peerPhone,
          'image',
          media.base64,
          media.mimetype || imageMsg.mimetype || 'image/jpeg',
          caption
        );
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'IMAGE', $5)`,
          [
            session.tripId,
            session.role,
            from,
            session.peerPhone,
            imageMsg.caption || '[Imagen]',
          ]
        );
      } else if (videoMsg) {
        const media = await getMediaBase64(data);
        const caption = videoMsg.caption
          ? `${roleTitle}\n${videoMsg.caption}`
          : roleTitle;
        await sendMedia(
          session.peerPhone,
          'video',
          media.base64,
          media.mimetype || videoMsg.mimetype || 'video/mp4',
          caption
        );
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'VIDEO', $5)`,
          [
            session.tripId,
            session.role,
            from,
            session.peerPhone,
            videoMsg.caption || '[Video]',
          ]
        );
      } else if (audioMsg) {
        const media = await getMediaBase64(data);
        await sendText(session.peerPhone, `${roleTitle} 🎤 _Nota de voz:_`);
        await sendAudio(session.peerPhone, media.base64);
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'AUDIO', '[Nota de voz]')`,
          [session.tripId, session.role, from, session.peerPhone]
        );
      } else if (location) {
        await sendText(session.peerPhone, `${roleTitle} 📍 _Ubicación en tiempo real:_`);
        await sendLocation(
          session.peerPhone,
          location.degreesLatitude,
          location.degreesLongitude,
          session.role === 'PASSENGER' ? 'Ubicación del Usuario' : 'Ubicación del Taxista'
        );
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'LOCATION', $5)`,
          [
            session.tripId,
            session.role,
            from,
            session.peerPhone,
            `${location.degreesLatitude},${location.degreesLongitude}`,
          ]
        );
      }
      return;
    }

    // 1E. CAPTURA DE CALIFICACIÓN PENDIENTE DEL PASAJERO (1 A 5)
    const rateRaw = await redis.get(`rate:${from}`);
    if (rateRaw) {
      if (location) {
        await redis.del(`rate:${from}`);
      } else if (upperText === 'OMITIR') {
        await redis.del(`rate:${from}`);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n👌 Calificación omitida. Cuando necesites otro taxi, envíanos tu ubicación o escribe *COTIZAR*.'
        );
        return;
      } else {
        const match = text.match(/^([1-5])(\s|$|\*|⭐)/);
        if (match) {
          const score = Number(match[1]);
          const rateState = JSON.parse(rateRaw);

          await db.query(`UPDATE trips SET rating = $1 WHERE id = $2`, [
            score,
            rateState.tripId,
          ]);
          const drvUpdate = await db.query(
            `UPDATE drivers
             SET rating_avg = ROUND(((COALESCE(rating_avg, 5.0) * COALESCE(rating_count, 0)) + $1)::numeric / (COALESCE(rating_count, 0) + 1), 2),
                 rating_count = COALESCE(rating_count, 0) + 1
             WHERE id = $2
             RETURNING phone, rating_avg, rating_count`,
            [score, rateState.driverId]
          );

          await redis.del(`rate:${from}`);
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n🙏 *¡Gracias por tu calificación de ${score}/5!*\nTu opinión nos ayuda a mantener el mejor servicio.`
          );

          const updatedDrv = drvUpdate.rows[0];
          if (updatedDrv) {
            await sendText(
              updatedDrv.phone,
              `🚖 *CENTRAL TAXI CALDAS:*\n⭐ *¡Recibiste una calificación de ${score}/5!*\nTu promedio actual es *${updatedDrv.rating_avg} ⭐* (${updatedDrv.rating_count} viajes calificados).`
            );
          }

          if (score <= 2) {
            for (const adminPhone of adminPhones) {
              await sendText(
                adminPhone,
                `🚖 *CENTRAL TAXI CALDAS • CALIFICACIÓN BAJA (${score}/5)*\n\n🚕 Taxista: *${rateState.driverName}* (*${rateState.plate}*)\n🧾 Viaje ID: *#${rateState.tripId}*\n👤 Usuario: *${from}*`
              );
            }
          }
          return;
        }

        if (/HOLA|TAXI|NECESITO|SERVICIO|PIDO|COTIZAR/i.test(upperText)) {
          await redis.del(`rate:${from}`);
        } else {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⭐ Por favor responde con un número del *1* al *5* para calificar tu último viaje, o escribe *OMITIR*.'
          );
          return;
        }
      }
    }

    // 2. FLUJO DE CONDUCTOR YA REGISTRADO (CON OPCIÓN DE PEDIR TAXI COMO PASAJERO)
    const driverRes = await db.query(`SELECT * FROM drivers WHERE phone = $1`, [
      from,
    ]);
    const registeredDriver = driverRes.rows[0] || null;
    const isDriverInPassengerMode = registeredDriver
      ? Boolean(await redis.get(`driver_passenger_mode:${from}`))
      : false;

    if (registeredDriver) {
      const driver = registeredDriver;
      const cmd = upperText;

      if (
        isDriverInPassengerMode &&
        (cmd === 'MODO CONDUCTOR' || cmd === 'VOLVER A CONDUCTOR')
      ) {
        await redis.del(`driver_passenger_mode:${from}`, `quote:${from}`, `pending_pickup:${from}`);
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n🚕 *Modo Taxista activado nuevamente, ${driver.full_name}.*\nEnvía tu *ubicación* (📎 -> Ubicación) o escribe *ACTIVO* para recibir servicios.`
        );
        return;
      }

      if (isDriverWantingPassengerMode(upperText)) {
        await db.query(`UPDATE drivers SET status = 'OFFLINE' WHERE id = $1`, [
          driver.id,
        ]);
        await redis.set(`driver_passenger_mode:${from}`, '1', 'EX', 7200);
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n🙋 *Modo Usuario activado, ${driver.full_name}.* Tu turno como taxista quedó en pausa.\n\n📍 Envíame tu *ubicación GPS* (📎 -> Ubicación) para pedir un taxi, o escribe *COTIZAR* para calcular un viaje de un punto A a un punto B.\n_(Cuando termines, escribe *MODO CONDUCTOR* para volver a operar)_`
        );
        return;
      }

      const activePassengerTrip = await db.query(
        `SELECT id FROM trips WHERE passenger_phone = $1 AND status IN ('SEARCHING', 'ACTIVE') LIMIT 1`,
        [from]
      );

      if (!isDriverInPassengerMode && activePassengerTrip.rows.length === 0) {
        if (!driver.is_verified || driver.approval_status !== 'APPROVED') {
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n⏳ Hola *${driver.full_name}*, tu registro para el vehículo *${driver.plate}* está en revisión. Te avisaremos por aquí en cuanto sea aprobado.\n\n_(Si necesitas pedir un taxi como usuario, escribe *PEDIR TAXI*)_`
          );
          return;
        }

        if (cmd === 'SALDO' || cmd === 'BILLETERA') {
          const txs = await db.query(
            `SELECT amount, type, description, TO_CHAR(created_at, 'DD/MM HH24:MI') AS fecha
             FROM wallet_transactions
             WHERE driver_id = $1
             ORDER BY created_at DESC
             LIMIT 5`,
            [driver.id]
          );
          const history =
            txs.rows.length > 0
              ? txs.rows
                  .map(
                    (t) =>
                      `• ${t.fecha}: *${t.amount >= 0 ? '+' : ''}${formatCOP(t.amount)}* (${t.description})`
                  )
                  .join('\n')
              : 'Sin movimientos aún.';

          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS • BILLETERA*\n\n👨‍✈️ Taxista: *${driver.full_name}*\n💰 Saldo actual: *${formatCOP(driver.balance)}*\n⭐ Calificación: *${driver.rating_avg || '5.00'}*\n💸 Comisión por servicio: *${formatCOP(tripCommission)}*\n\n*Últimos movimientos:*\n${history}\n\nPara recargar, transfiere vía Nequi/Llave al *${centralPhone.replace(/^57/, '')}* indicando tu placa *${driver.plate}*.`
          );
          return;
        }

        if (cmd === 'PAUSA') {
          await db.query(`UPDATE drivers SET status = 'OFFLINE' WHERE id = $1`, [
            driver.id,
          ]);
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n🔴 Turno pausado, *${driver.full_name}*. Escribe *ACTIVO* o envía tu ubicación cuando vuelvas a operar.`
          );
          return;
        }

        if (cmd === 'ACTIVO' || location) {
          if (driver.balance < tripCommission) {
            await sendText(
              from,
              `🚖 *CENTRAL TAXI CALDAS:*\n⚠️ *Saldo insuficiente para operar*\n\nTu saldo actual es *${formatCOP(driver.balance)}* y el mínimo requerido por carrera es *${formatCOP(tripCommission)}*.\n\nRecarga tu cuenta vía Nequi/Llave al *${centralPhone.replace(/^57/, '')}* enviando tu placa *${driver.plate}*.`
            );
            return;
          }
        }

        if (cmd === 'ACTIVO') {
          await db.query(`UPDATE drivers SET status = 'AVAILABLE' WHERE id = $1`, [
            driver.id,
          ]);
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n🟢 Estás *DISPONIBLE*, *${driver.full_name}* (Saldo: *${formatCOP(driver.balance)}*).\nEnvíame tu ubicación actual (📎 -> Ubicación) para recibir servicios cercanos.`
          );
          return;
        }

        if (location) {
          await db.query(
            `UPDATE drivers SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, last_location_at = NOW(), status = 'AVAILABLE' WHERE id = $3`,
            [location.degreesLongitude, location.degreesLatitude, driver.id]
          );
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n📍 Ubicación GPS actualizada, *${driver.full_name}* (Saldo: *${formatCOP(driver.balance)}*). Buscando pasajeros cerca de ti...`
          );
          return;
        }

        const pendingTripId = await redis.get(`offer:${from}`);
        if (pendingTripId && (cmd === '1' || cmd === 'YO')) {
          if (driver.balance < tripCommission) {
            await sendText(
              from,
              `🚖 *CENTRAL TAXI CALDAS:*\n⚠️ No tienes saldo suficiente (*${formatCOP(driver.balance)}*) para tomar esta carrera. Escribe *SALDO* para ver cómo recargar.`
            );
            return;
          }

          const lock = await redis.set(
            `trip:lock:${pendingTripId}`,
            driver.id,
            'EX',
            3600,
            'NX'
          );
          if (!lock) {
            await sendText(
              from,
              '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Lo sentimos, otro taxista acaba de tomar este servicio.'
            );
            return;
          }

          const client = await db.connect();
          let newBalance = 0;
          let trip: any = null;
          let distanceMeters: number | null = null;

          try {
            await client.query('BEGIN');

            const tripCheck = await client.query(
              `SELECT id FROM trips WHERE id = $1 AND status = 'SEARCHING' FOR UPDATE`,
              [pendingTripId]
            );

            if (tripCheck.rows.length === 0) {
              await client.query('ROLLBACK');
              await redis.del(`trip:lock:${pendingTripId}`, `offer:${from}`);
              await sendText(
                from,
                '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Este servicio ya fue cancelado por el usuario o tomado.'
              );
              return;
            }

            const balRes = await client.query(
              `UPDATE drivers
               SET balance = balance - $1, status = 'BUSY'
               WHERE id = $2 AND balance >= $1
               RETURNING balance`,
              [tripCommission, driver.id]
            );

            if (balRes.rows.length === 0) {
              await client.query('ROLLBACK');
              await redis.del(`trip:lock:${pendingTripId}`);
              await sendText(
                from,
                '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Saldo insuficiente para tomar el servicio.'
              );
              return;
            }

            newBalance = balRes.rows[0].balance;

            const tripRes = await client.query(
              `UPDATE trips
               SET driver_id = $1, status = 'ACTIVE', accepted_at = NOW()
               WHERE id = $2
               RETURNING *,
                 ST_Y(pickup_location::geometry) AS lat,
                 ST_X(pickup_location::geometry) AS lng,
                 (
                   SELECT ROUND(ST_Distance(d.location, trips.pickup_location))
                   FROM drivers d WHERE d.id = $1
                 ) AS distance_meters`,
              [driver.id, pendingTripId]
            );
            trip = tripRes.rows[0];
            distanceMeters = trip.distance_meters;

            await client.query(
              `INSERT INTO wallet_transactions (driver_id, amount, type, trip_id, description)
               VALUES ($1, $2, 'COMMISSION', $3, $4)`,
              [driver.id, -tripCommission, trip.id, `Comisión servicio #${trip.id}`]
            );

            await client.query('COMMIT');
          } catch (txErr) {
            await client.query('ROLLBACK');
            await redis.del(`trip:lock:${pendingTripId}`);
            throw txErr;
          } finally {
            client.release();
          }

          const [passRes, drvPassRes, completedRes] = await Promise.all([
            db.query(`SELECT full_name FROM passengers WHERE phone = $1`, [
              trip.passenger_phone,
            ]),
            db.query(`SELECT full_name FROM drivers WHERE phone = $1`, [
              trip.passenger_phone,
            ]),
            db.query(
              `SELECT COUNT(*)::int AS total FROM trips WHERE driver_id = $1 AND status = 'COMPLETED'`,
              [driver.id]
            ),
          ]);

          const passengerName =
            passRes.rows[0]?.full_name || drvPassRes.rows[0]?.full_name || null;
          const completedTrips = completedRes.rows[0]?.total || 0;
          const eta = calculateEtaEstimate(distanceMeters);

          await redis.del(`offer:${from}`);
          await redis.set(
            `session:${trip.passenger_phone}`,
            JSON.stringify({
              tripId: trip.id,
              role: 'PASSENGER',
              peerPhone: from,
              senderName: passengerName || 'Cliente',
            }),
            'EX',
            7200
          );
          await redis.set(
            `session:${from}`,
            JSON.stringify({
              tripId: trip.id,
              role: 'DRIVER',
              peerPhone: trip.passenger_phone,
              senderName: `${driver.full_name} • ${driver.plate}`,
            }),
            'EX',
            7200
          );

          const quoteInfoForPassenger =
            trip.dropoff_address && trip.estimated_fare
              ? `\n🏁 *Destino (B):* ${trip.dropoff_address}\n💵 *Valor aproximado del servicio:* *${formatCOP(trip.estimated_fare)}* (${trip.distance_km} km)\n`
              : '\n';

          const passengerCardText =
            `🚖 *CENTRAL TAXI CALDAS • TAXI ASIGNADO*\n\n` +
            `✅ *¡Tu taxi va en camino${passengerName ? `, ${passengerName}` : ''}!*\n` +
            `⏱️ *Tiempo estimado de llegada:* *${eta.rangeText}* (${eta.distanceText})` +
            `${quoteInfoForPassenger}\n` +
            `👨‍✈️ *Perfil del Taxista:*\n` +
            `• *Nombre:* ${driver.full_name}\n` +
            `• *Calificación:* ${driver.rating_avg || '5.00'} ⭐ (${driver.rating_count || 0} calif.)\n` +
            `• *Servicios completados:* ${completedTrips}\n` +
            `• *Estado:* Verificado ✅\n\n` +
            `🚕 *Datos del Vehículo:*\n` +
            `• *Vehículo:* ${driver.vehicle_model}\n` +
            `• *Placa:* *${driver.plate}*\n\n` +
            `💬 Todo mensaje que envíes por aquí llegará identificado como *USUARIO* al taxista (tu número permanece privado).\n` +
            `• Escribe *CANCELAR* para cancelar\n` +
            `• Escribe *SOS* en caso de emergencia`;

          let photoSent = false;
          if (driver.profile_photo_path) {
            const fullPhotoPath = path.join(
              process.cwd(),
              driver.profile_photo_path
            );
            if (fs.existsSync(fullPhotoPath)) {
              const photoBase64 = fs.readFileSync(fullPhotoPath).toString('base64');
              await sendMedia(
                trip.passenger_phone,
                'image',
                photoBase64,
                'image/jpeg',
                passengerCardText
              );
              photoSent = true;
            }
          }

          if (!photoSent) {
            await sendText(trip.passenger_phone, passengerCardText);
          }

          const quoteInfoForDriver =
            trip.dropoff_address && trip.estimated_fare
              ? `\n🏁 *Destino (B):* ${trip.dropoff_address}\n💵 *Valor aproximado servicio:* *${formatCOP(trip.estimated_fare)}* (${trip.distance_km} km)`
              : `\n🏁 *Destino (B):* Por confirmar con el usuario`;

          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS • SERVICIO ASIGNADO*\n\n` +
              `👤 *Usuario:* ${passengerName || 'Cliente Taxi Caldas'}\n` +
              `⏱️ *Tiempo estimado al punto A:* ${eta.rangeText}` +
              `${quoteInfoForDriver}\n` +
              `💸 *Comisión descontada:* -${formatCOP(tripCommission)}\n` +
              `💰 *Saldo restante:* ${formatCOP(newBalance)}\n\n` +
              `💬 Tus mensajes llegarán identificados como *TAXISTA* al usuario.\n` +
              `• *FIN* - Terminar viaje\n` +
              `• *CANCELAR* - Cancelar servicio\n` +
              `• *SOS* - Emergencia`
          );
          await sendLocation(from, trip.lat, trip.lng, 'Punto A: Recogida del Usuario');
          return;
        }

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS*\nHola *${driver.full_name}* (*${driver.plate}*) | ${driver.rating_avg || '5.00'} ⭐\n\nComandos de taxista:\n• Envía tu *ubicación* (📎 -> Ubicación) para activar turno\n• *SALDO* - Ver saldo y movimientos\n• *PAUSA* - Pausar turno\n• *PEDIR TAXI* - Cambiar a modo usuario para pedir un taxi`
        );
        return;
      }
    }

    // 3. CONFIRMACIÓN DE ROL (USUARIO VS TAXISTA) Y AUTO-REGISTRO DE NUEVO TAXISTA
    const regRaw = await redis.get(`reg:${from}`);

    if (upperText === 'CANCELAR' && regRaw) {
      await redis.del(`reg:${from}`);
      await sendText(
        from,
        '🚖 *CENTRAL TAXI CALDAS:*\n❌ Registro cancelado. Si deseas pedir un taxi o cotizar, escríbenos *HOLA*.'
      );
      return;
    }

    const pendingRoleConfirm = await redis.get(`role_confirm:${from}`);
    if (pendingRoleConfirm && !regRaw) {
      if (upperText === 'CANCELAR') {
        await redis.del(`role_confirm:${from}`);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n❌ Operación cancelada. Escríbenos *HOLA* cuando nos necesites.'
        );
        return;
      }

      if (
        upperText === '2' ||
        upperText === 'TAXISTA' ||
        upperText === 'CONDUCTOR' ||
        upperText === 'SOY TAXISTA' ||
        upperText === 'SOY TAXI' ||
        upperText === 'SOY CONDUCTOR'
      ) {
        await redis.del(`role_confirm:${from}`, `consent_pending:${from}`, `ask_name:${from}`);
        await redis.set(
          `reg:${from}`,
          JSON.stringify({ step: 'ASK_CONSENT' }),
          'EX',
          1800
        );
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS • AFILIACIÓN DE TAXISTAS*\n\n' +
            '📋 *Autorización de Tratamiento de Datos (Ley 1581 de 2012):*\n' +
            'Para validar tu identidad, vehículo, documentos, foto de perfil y ubicación GPS durante los servicios, autorizas a *Taxi Caldas* el tratamiento de tus datos personales conforme a nuestra política de privacidad.\n\n' +
            '👉 Responde *ACEPTO* (o *1*) para iniciar tu registro, o *CANCELAR* para salir.'
        );
        return;
      }

      if (
        upperText === '1' ||
        upperText === 'PASAJERO' ||
        upperText === 'USUARIO' ||
        upperText === 'PEDIR' ||
        upperText === 'PEDIR TAXI' ||
        Boolean(location)
      ) {
        await redis.del(`role_confirm:${from}`);
      } else {
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\nPor favor confírmame con un número qué deseas hacer:\n\n' +
            '*1* 👉 Soy *USUARIO* (quiero pedir o cotizar un taxi)\n' +
            '*2* 👉 Soy *TAXISTA / CONDUCTOR* (quiero registrar mi vehículo)'
        );
        return;
      }
    }

    if (!regRaw && !registeredDriver && isAmbiguousTaxiOrDriverIntent(upperText)) {
      await redis.set(`role_confirm:${from}`, '1', 'EX', 1800);
      await sendText(
        from,
        '🚖 *CENTRAL TAXI CALDAS:*\n¡Hola! Para atenderte correctamente, confírmame por favor qué deseas hacer:\n\n' +
          '*1* 👉 Soy *USUARIO* (quiero pedir o cotizar un taxi)\n' +
          '*2* 👉 Soy *TAXISTA / CONDUCTOR* (quiero registrar mi vehículo para trabajar)\n\n' +
          'Responde *1* o *2*.'
      );
      return;
    }

    if (regRaw) {
      const regState = JSON.parse(regRaw);

      if (regState.step === 'ASK_CONSENT') {
        if (isConsentRejected(upperText)) {
          await redis.del(`reg:${from}`);
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\nℹ️ Entendido. Sin autorización de tratamiento de datos no podemos registrar tu perfil de taxista.'
          );
          return;
        }
        if (!isConsentAccepted(upperText)) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n📋 Por favor responde *ACEPTO* (o *1*) para autorizar el tratamiento de tus datos personales y continuar con tu registro, o escribe *CANCELAR*.'
          );
          return;
        }

        regState.dataConsent = true;
        regState.dataConsentAt = new Date().toISOString();
        regState.step = 'ASK_NAME';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n✅ *Autorización registrada.*\n\nCompletemos tu perfil en 5 pasos rápidos:\n1️⃣ Por favor escribe tu *nombre y apellido*:'
        );
        return;
      }

      if (regState.step === 'ASK_NAME') {
        if (text.length < 3) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Por favor escribe tu nombre completo (mínimo 3 letras):'
          );
          return;
        }
        regState.fullName = formatProperName(text);
        regState.step = 'ASK_PLATE';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n2️⃣ Gracias *${regState.fullName}*. Ahora escribe la *placa* de tu taxi (Ej: *WXY-123*):`
        );
        return;
      }

      if (regState.step === 'ASK_PLATE') {
        const cleanPlate = text.toUpperCase().replace(/\s+/g, '');
        if (cleanPlate.length < 5) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Placa no válida. Escríbela nuevamente (Ej: *WXY-123*):'
          );
          return;
        }
        const exists = await db.query(
          `SELECT id FROM drivers WHERE UPPER(plate) = $1`,
          [cleanPlate]
        );
        if (exists.rows.length > 0) {
          await sendText(
            from,
            `🚖 *CENTRAL TAXI CALDAS:*\n⚠️ La placa *${cleanPlate}* ya está registrada. Escribe otra placa o *CANCELAR*:`
          );
          return;
        }
        regState.plate = cleanPlate;
        regState.step = 'ASK_MODEL';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n3️⃣ Escribe la *marca, línea y color* del vehículo (Ej: *Kia Picanto Amarillo*):'
        );
        return;
      }

      if (regState.step === 'ASK_MODEL') {
        if (text.length < 3) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ Indica el modelo y color del vehículo (Ej: *Hyundai i10 Amarillo*):'
          );
          return;
        }
        regState.vehicleModel = text;
        regState.step = 'ASK_PROFILE_PHOTO';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n4️⃣ Ahora envía una *foto tipo selfie clara de tu rostro* (📎 -> Cámara o Galería).\n_Esta foto será mostrada a los usuarios cuando aceptes un servicio._'
        );
        return;
      }

      if (regState.step === 'ASK_PROFILE_PHOTO') {
        if (!imageMsg) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n🤳 Por favor adjunta una *foto de tu rostro* (imagen) para tu perfil de taxista, o escribe *CANCELAR*:'
          );
          return;
        }

        const media = await getMediaBase64(data);
        const profileFileName = `profile_${from}_${Date.now()}.jpg`;
        const profileRelativePath = `uploads/drivers/${profileFileName}`;
        fs.writeFileSync(
          path.join(process.cwd(), profileRelativePath),
          Buffer.from(media.base64, 'base64')
        );

        regState.profilePhotoPath = profileRelativePath;
        regState.step = 'ASK_DOC_PHOTO';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n5️⃣ ¡Foto de perfil guardada! Por último, envía una *foto clara de tu Tarjetón / Licencia de conducción o Tarjeta de Propiedad* (📎 -> Cámara o Galería):'
        );
        return;
      }

      if (regState.step === 'ASK_DOC_PHOTO') {
        if (!imageMsg && !docMsg) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n📸 Por favor adjunta una *foto* de tus documentos (no texto) para completar el registro, o escribe *CANCELAR*:'
          );
          return;
        }

        const media = await getMediaBase64(data);
        const ext = docMsg ? 'pdf' : 'jpg';
        const docFileName = `doc_${from}_${Date.now()}.${ext}`;
        const docRelativePath = `uploads/drivers/${docFileName}`;
        fs.writeFileSync(
          path.join(process.cwd(), docRelativePath),
          Buffer.from(media.base64, 'base64')
        );

        await db.query(
          `INSERT INTO drivers (
             phone, full_name, plate, vehicle_model, status, is_verified,
             approval_status, balance, profile_photo_path, doc_photo_path,
             data_consent, data_consent_at
           )
           VALUES ($1, $2, $3, $4, 'OFFLINE', FALSE, 'PENDING', 0, $5, $6, TRUE, $7)`,
          [
            from,
            regState.fullName,
            regState.plate,
            regState.vehicleModel,
            regState.profilePhotoPath || null,
            docRelativePath,
            regState.dataConsentAt || new Date().toISOString(),
          ]
        );

        await redis.del(`reg:${from}`);

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n✅ *¡Solicitud de registro completada, ${regState.fullName}!*\n\n🔢 Placa: *${regState.plate}*\n🚕 Vehículo: *${regState.vehicleModel}*\n📋 Habeas Data: *Autorizado*\n\nValidaremos tu foto de perfil y documentos, y te activaremos por este mismo chat.`
        );

        const adminPhone = adminPhones[0];
        if (adminPhone) {
          const summary = `🚖 *CENTRAL TAXI CALDAS • NUEVO TAXISTA*\n\n👤 Nombre: *${regState.fullName}*\n📱 Teléfono: *${from}*\n🔢 Placa: *${regState.plate}*\n🚕 Vehículo: *${regState.vehicleModel}*\n\nPara aprobarlo y darle saldo inicial responde:\n*/aprobar ${regState.plate} 5000*`;
          if (imageMsg) {
            await sendMedia(
              adminPhone,
              'image',
              media.base64,
              media.mimetype || imageMsg.mimetype || 'image/jpeg',
              summary
            );
          } else {
            await sendText(adminPhone, summary);
          }
        }
        return;
      }
    }

    // 4. VERIFICACIÓN PREVIA DE HABEAS DATA (LEY 1581 DE 2012) PARA USUARIOS
    let passenger: any = null;
    if (registeredDriver && isDriverInPassengerMode) {
      passenger = {
        full_name: registeredDriver.full_name,
        data_consent: true,
      };
    } else {
      const passengerRes = await db.query(
        `SELECT * FROM passengers WHERE phone = $1`,
        [from]
      );
      passenger = passengerRes.rows[0] || null;

      if (upperText === 'ELIMINAR MIS DATOS' || upperText === 'REVOCAR DATOS') {
        await db.query(`DELETE FROM passengers WHERE phone = $1`, [from]);
        await redis.del(`consent_pending:${from}`, `ask_name:${from}`, `quote:${from}`, `pending_pickup:${from}`);
        await sendText(
          from,
          '🚖 *CENTRAL TAXI CALDAS:*\n🗑️ Tus datos personales han sido eliminados de nuestra base de datos conforme a la Ley 1581 de 2012. Si deseas volver a usar el servicio más adelante, escríbenos *HOLA*.'
        );
        return;
      }

      if (!passenger || !passenger.data_consent) {
        const pendingConsent = await redis.get(`consent_pending:${from}`);

        if (pendingConsent) {
          if (upperText === '2') {
            await redis.del(`consent_pending:${from}`);
            await redis.set(
              `reg:${from}`,
              JSON.stringify({ step: 'ASK_CONSENT' }),
              'EX',
              1800
            );
            await sendText(
              from,
              '🚖 *CENTRAL TAXI CALDAS • AFILIACIÓN DE TAXISTAS*\n\n' +
                '📋 *Autorización de Tratamiento de Datos (Ley 1581 de 2012):*\n' +
                'Para validar tu identidad, vehículo, documentos, foto de perfil y ubicación GPS durante los servicios, autorizas a *Taxi Caldas* el tratamiento de tus datos personales conforme a nuestra política de privacidad.\n\n' +
                '👉 Responde *ACEPTO* (o *1*) para iniciar tu registro.'
            );
            return;
          }

          if (isConsentRejected(upperText)) {
            await redis.del(`consent_pending:${from}`);
            await sendText(
              from,
              '🚖 *CENTRAL TAXI CALDAS:*\nℹ️ Entendido. Sin tu autorización de tratamiento de datos no podemos registrar tu perfil ni gestionar servicios. Cuando desees autorizar, escríbenos *HOLA*.'
            );
            return;
          }

          if (isConsentAccepted(upperText)) {
            const savedRes = await db.query(
              `INSERT INTO passengers (phone, push_name, data_consent, data_consent_at, last_interaction_at)
               VALUES ($1, $2, TRUE, NOW(), NOW())
               ON CONFLICT (phone) DO UPDATE SET
                 push_name = COALESCE(NULLIF(EXCLUDED.push_name, ''), passengers.push_name),
                 data_consent = TRUE,
                 data_consent_at = NOW(),
                 last_interaction_at = NOW()
               RETURNING *`,
              [from, pushName || null]
            );
            passenger = savedRes.rows[0];
            await redis.del(`consent_pending:${from}`);

            if (!passenger.full_name) {
              await redis.set(`ask_name:${from}`, '1', 'EX', 3600);
              await sendText(
                from,
                '🚖 *CENTRAL TAXI CALDAS:*\n✅ *¡Autorización registrada!* Gracias por confiar en nosotros.\n\nPara brindarte una atención personalizada, ¿cuál es tu *nombre y apellido*? 😊'
              );
              return;
            }
          } else {
            await sendText(
              from,
              '🚖 *CENTRAL TAXI CALDAS:*\n📋 Para continuar y cumplir con la Ley 1581 de 2012 (Habeas Data), por favor responde *ACEPTO* (o *1*) autorizando el tratamiento de tus datos personales para pedir o cotizar tu taxi.'
            );
            return;
          }
        } else {
          await redis.set(`consent_pending:${from}`, '1', 'EX', 3600);
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS*\n¡Hola! Bienvenido.\n\n' +
              '📋 *Aviso de Protección de Datos (Ley 1581 de 2012):*\n' +
              'Para gestionar tu solicitud de taxi, cotizaciones, seguridad GPS e historial de viajes, autorizas a *Taxi Caldas* el tratamiento de tus datos personales conforme a nuestra política de privacidad.\n\n' +
              '👉 Responde *ACEPTO* (o *1*) para continuar.\n' +
              '🚕 Si eres taxista y deseas registrar tu vehículo, responde *2* o escribe *SOY TAXISTA*.'
          );
          return;
        }
      } else {
        await db.query(
          `UPDATE passengers
           SET push_name = COALESCE(NULLIF($2, ''), push_name),
               last_interaction_at = NOW()
           WHERE phone = $1`,
          [from, pushName || null]
        );
      }
    }

    const passengerName: string | null = passenger?.full_name || null;

    if (upperText === 'CANCELAR') {
      await redis.del(`ask_name:${from}`, `quote:${from}`, `pending_pickup:${from}`);
      const searchingTrip = await db.query(
        `UPDATE trips
         SET status = 'CANCELLED', cancelled_by = 'PASSENGER', cancelled_at = NOW()
         WHERE id = (
           SELECT id FROM trips
           WHERE passenger_phone = $1 AND status = 'SEARCHING'
           ORDER BY created_at DESC LIMIT 1
         )
         RETURNING id`,
        [from]
      );
      if (searchingTrip.rows.length > 0) {
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n❌ Hemos cancelado tu búsqueda de taxi${passengerName ? `, *${passengerName}*` : ''}.`
        );
      } else {
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\nℹ️ Operación cancelada${passengerName ? `, *${passengerName}*` : ''}. Envía tu *ubicación actual* para pedir un taxi o escribe *COTIZAR* para calcular el valor de un viaje.`
        );
      }
      return;
    }

    // Verificar si el usuario ya tiene una búsqueda o viaje activo
    const existingTripRes = await db.query(
      `SELECT t.id, t.status, d.plate AS driver_plate, d.full_name AS driver_name, d.phone AS driver_phone
       FROM trips t
       LEFT JOIN drivers d ON t.driver_id = d.id
       WHERE t.passenger_phone = $1 AND t.status IN ('SEARCHING', 'ACTIVE')
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [from]
    );

    if (existingTripRes.rows.length > 0) {
      const existing = existingTripRes.rows[0];

      if (existing.status === 'ACTIVE' && existing.driver_phone) {
        await redis.set(
          `session:${from}`,
          JSON.stringify({
            tripId: existing.id,
            role: 'PASSENGER',
            peerPhone: existing.driver_phone,
            senderName: passengerName || 'Cliente',
          }),
          'EX',
          7200
        );
        await redis.set(
          `session:${existing.driver_phone}`,
          JSON.stringify({
            tripId: existing.id,
            role: 'DRIVER',
            peerPhone: from,
            senderName: `${existing.driver_name} • ${existing.driver_plate}`,
          }),
          'EX',
          7200
        );
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n🚕 ${passengerName ? `*${passengerName}*, ya` : 'Ya'} tienes un taxi asignado en curso (*${existing.driver_plate}* - ${existing.driver_name}).\nPuedes escribirle directamente por aquí (tus mensajes le llegarán como *USUARIO*) o enviar *CANCELAR*.`
        );
        return;
      }

      if (location) {
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n⏳ *Ya tienes una solicitud de taxi en curso (Servicio #${existing.id})${passengerName ? `, ${passengerName}` : ''}.*\nEstamos alertando a los taxistas cercanos. Espera un momento o escribe *CANCELAR* para detenerla.`
        );
      } else {
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n⏳ Seguimos buscando un taxista cercano para tu solicitud *#${existing.id}*${passengerName ? `, *${passengerName}*` : ''}.\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
        );
      }
      return;
    }

    // 5. FLUJO DE COTIZACIÓN DE PUNTO A A PUNTO B (Y PEDIDO DIRECTO)
    const quoteRaw = await redis.get(`quote:${from}`);
    const pendingPickupRaw = await redis.get(`pending_pickup:${from}`);

    // Si el usuario inicia manualmente COTIZAR
    if (isQuoteIntent(upperText)) {
      await redis.del(`ask_name:${from}`, `pending_pickup:${from}`);
      await redis.set(
        `quote:${from}`,
        JSON.stringify({ step: 'ASK_ORIGIN' }),
        'EX',
        1800
      );
      await sendText(
        from,
        `🚖 *CENTRAL TAXI CALDAS • COTIZADOR DE SERVICIO*\n\n` +
          `1️⃣ Envía el *Punto A (Origen)*:\n` +
          `• Comparte tu *ubicación GPS* (📎 -> Ubicación)\n` +
          `• O escribe el *lugar/barrio de salida* (ej: _Parque Principal de Caldas_, _La Variante_)\n\n` +
          `_(Escribe *CANCELAR* en cualquier momento para salir)_`
      );
      return;
    }

    // Si está dentro del flujo guiado de cotización (ASK_ORIGIN -> ASK_DESTINATION -> CONFIRM_QUOTE)
    if (quoteRaw) {
      const qState = JSON.parse(quoteRaw);

      if (qState.step === 'ASK_ORIGIN') {
        let originPoint: GeoPoint | null = null;
        if (location) {
          originPoint = {
            lat: location.degreesLatitude,
            lng: location.degreesLongitude,
            label: 'Ubicación GPS compartida (Origen)',
          };
        } else if (text) {
          originPoint = await resolvePlaceToCoords(text);
        }

        if (!originPoint) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ No logré ubicar ese punto de salida. Por favor comparte el *pin de ubicación GPS* (📎 -> Ubicación) o escribe un lugar conocido (ej: _Parque de Caldas_, _La Miel_, _Mayorca_).'
          );
          return;
        }

        qState.origin = originPoint;
        qState.step = 'ASK_DESTINATION';
        await redis.set(`quote:${from}`, JSON.stringify(qState), 'EX', 1800);
        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS • COTIZADOR*\n\n` +
            `✅ *Punto A (Origen):* ${originPoint.label}\n\n` +
            `2️⃣ Ahora envía el *Punto B (Destino)*:\n` +
            `• Comparte el *pin GPS del destino* (📎 -> Ubicación)\n` +
            `• O escribe el *lugar/barrio de destino* (ej: _Centro Comercial Mayorca_, _Estación La Estrella_, _El Poblado_)`
        );
        return;
      }

      if (qState.step === 'ASK_DESTINATION') {
        let destPoint: GeoPoint | null = null;
        if (location) {
          destPoint = {
            lat: location.degreesLatitude,
            lng: location.degreesLongitude,
            label: 'Ubicación GPS de destino',
          };
        } else if (text) {
          destPoint = await resolvePlaceToCoords(text);
        }

        if (!destPoint) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ No logré ubicar ese destino. Envía el *pin GPS del destino* (📎 -> Ubicación) o escribe el nombre del lugar/barrio (ej: _Mayorca_, _Envigado_, _Parque de Caldas_).'
          );
          return;
        }

        const routeQuote = await calculateRouteQuote(qState.origin, destPoint, {
          baseFare,
          pricePerKm,
          minFare,
        });

        qState.destination = destPoint;
        qState.distanceKm = routeQuote.distanceKm;
        qState.durationMinutes = routeQuote.durationMinutes;
        qState.estimatedFare = routeQuote.estimatedFare;
        qState.step = 'CONFIRM_QUOTE';
        await redis.set(`quote:${from}`, JSON.stringify(qState), 'EX', 1800);

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS • COTIZACIÓN ESTIMADA*\n\n` +
            `📍 *Origen (A):* ${qState.origin.label}\n` +
            `🏁 *Destino (B):* ${destPoint.label}\n` +
            `🛣️ *Distancia estimada:* ${routeQuote.distanceKm} km (~${routeQuote.durationMinutes} min)\n` +
            `💵 *Valor aproximado del servicio:* *${formatCOP(routeQuote.estimatedFare)}*\n\n` +
            `👉 Responde *1* o *PEDIR* para solicitar el taxi ahora mismo con este destino y tarifa.\n` +
            `_(O escribe *COTIZAR* para calcular otra ruta, o *CANCELAR* para salir)_`
        );
        return;
      }

      if (qState.step === 'CONFIRM_QUOTE') {
        if (
          upperText === '1' ||
          upperText === 'PEDIR' ||
          upperText === 'SI' ||
          upperText === 'SÍ' ||
          upperText === 'CONFIRMAR' ||
          upperText === 'SOLICITAR'
        ) {
          await redis.del(`quote:${from}`);
          await dispatchTripFromPickup({
            passengerPhone: from,
            passengerName,
            pickup: qState.origin,
            dropoff: qState.destination,
            distanceKm: qState.distanceKm,
            estimatedFare: qState.estimatedFare,
            tripCommission,
          });
          return;
        }

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n💵 Tu cotización de *${qState.origin.label}* a *${qState.destination.label}* es de *${formatCOP(qState.estimatedFare)}*.\n\nResponde *1* o *PEDIR* para enviar un taxista, *COTIZAR* para cambiar de ruta, o *CANCELAR*.`
        );
        return;
      }
    }

    // Si el usuario había enviado Punto A (GPS) y ahora responde:
    // - "1" / "DIRECTO" / "PEDIR" -> despacha sin destino B
    // - Otro texto o segundo GPS -> lo toma como Punto B, cotiza y pide confirmación
    if (pendingPickupRaw) {
      const pState = JSON.parse(pendingPickupRaw);
      const pickupPoint: GeoPoint = pState.origin;

      if (
        upperText === '1' ||
        upperText === 'DIRECTO' ||
        upperText === 'PEDIR' ||
        upperText === 'YA' ||
        upperText === 'SIN DESTINO'
      ) {
        await redis.del(`pending_pickup:${from}`);
        await dispatchTripFromPickup({
          passengerPhone: from,
          passengerName,
          pickup: pickupPoint,
          tripCommission,
        });
        return;
      }

      let destPoint: GeoPoint | null = null;
      if (location) {
        destPoint = {
          lat: location.degreesLatitude,
          lng: location.degreesLongitude,
          label: 'Ubicación GPS de destino',
        };
      } else if (text) {
        destPoint = await resolvePlaceToCoords(text);
      }

      if (destPoint) {
        await redis.del(`pending_pickup:${from}`);
        const routeQuote = await calculateRouteQuote(pickupPoint, destPoint, {
          baseFare,
          pricePerKm,
          minFare,
        });

        await redis.set(
          `quote:${from}`,
          JSON.stringify({
            step: 'CONFIRM_QUOTE',
            origin: pickupPoint,
            destination: destPoint,
            distanceKm: routeQuote.distanceKm,
            durationMinutes: routeQuote.durationMinutes,
            estimatedFare: routeQuote.estimatedFare,
          }),
          'EX',
          1800
        );

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS • COTIZACIÓN ESTIMADA*\n\n` +
            `📍 *Origen (A):* ${pickupPoint.label}\n` +
            `🏁 *Destino (B):* ${destPoint.label}\n` +
            `🛣️ *Distancia estimada:* ${routeQuote.distanceKm} km (~${routeQuote.durationMinutes} min)\n` +
            `💵 *Valor aproximado del servicio:* *${formatCOP(routeQuote.estimatedFare)}*\n\n` +
            `👉 Responde *1* o *PEDIR* para solicitar el taxi ahora mismo con este valor, o *CANCELAR* para salir.`
        );
        return;
      }

      await sendText(
        from,
        '🚖 *CENTRAL TAXI CALDAS:*\n⚠️ No reconocí ese destino. Escribe un lugar/barrio conocido (ej: _Mayorca_, _Parque de Caldas_), envía el pin GPS de destino, o responde *1* para pedir el taxi directo.'
      );
      return;
    }

    // Si envía ubicación GPS directamente (Punto A): ofrece cotizar Punto B o pedir directo (con auto-despacho a los 18s)
    if (location) {
      await redis.del(`ask_name:${from}`);
      const pickupPoint: GeoPoint = {
        lat: location.degreesLatitude,
        lng: location.degreesLongitude,
        label: 'Ubicación GPS compartida',
      };
      const token = `${Date.now()}`;

      await redis.set(
        `pending_pickup:${from}`,
        JSON.stringify({ origin: pickupPoint, token }),
        'EX',
        120
      );

      await sendText(
        from,
        `🚖 *CENTRAL TAXI CALDAS:*\n` +
          `📍 *Punto A (Recogida)* recibido${passengerName ? `, *${passengerName}*` : ''}.\n\n` +
          `¿Deseas conocer el *valor aproximado* antes de pedir?\n` +
          `• Escribe tu *destino (Punto B)* (ej: _Mayorca_, _Parque de Caldas_) o envía el *pin GPS de destino*\n` +
          `• O responde *1* / *DIRECTO* para buscar tu taxi de inmediato.`
      );

      // Si el usuario no escribe destino en 18 segundos, despacha automáticamente para no demorarlo
      setTimeout(async () => {
        try {
          const stillWaitingRaw = await redis.get(`pending_pickup:${from}`);
          if (!stillWaitingRaw) return;
          const stillWaiting = JSON.parse(stillWaitingRaw);
          if (stillWaiting.token !== token) return;

          await redis.del(`pending_pickup:${from}`);
          await dispatchTripFromPickup({
            passengerPhone: from,
            passengerName,
            pickup: pickupPoint,
            tripCommission,
          });
        } catch (err) {
          console.error('Error en auto-despacho pendiente:', err);
        }
      }, 18_000);
      return;
    }

    // 6. CAPTURA O SALUDO PERSONALIZADO POR NOMBRE PARA USUARIOS CON HABEAS DATA ACEPTADO
    if (!passengerName) {
      const waitingName = await redis.get(`ask_name:${from}`);

      if (waitingName && text) {
        if (isInvalidNameInput(text)) {
          await sendText(
            from,
            '🚖 *CENTRAL TAXI CALDAS:*\n😊 Para completar tu registro y llamarte por tu nombre, dime por favor cómo te llamas *(Ej: Carlos Pérez)*:\n\n_(O envía directamente tu *ubicación actual* 📎 -> Ubicación)_'
          );
          return;
        }

        const formattedName = formatProperName(text);
        await db.query(
          `UPDATE passengers SET full_name = $1, last_interaction_at = NOW() WHERE phone = $2`,
          [formattedName, from]
        );
        await redis.del(`ask_name:${from}`);

        await sendText(
          from,
          `🚖 *CENTRAL TAXI CALDAS:*\n🙌 ¡Mucho gusto, *${formattedName}*! Ya quedaste registrado.\n\n` +
            `• 📍 Envía tu *ubicación actual* (📎 -> Ubicación) para pedir un taxi\n` +
            `• 💵 O escribe *COTIZAR* para calcular el valor de un viaje de un punto A a un punto B.`
        );
        return;
      }

      await redis.set(`ask_name:${from}`, '1', 'EX', 3600);
      await sendText(
        from,
        '🚖 *CENTRAL TAXI CALDAS:*\n😊 Para brindarte una atención personalizada, ¿cuál es tu *nombre y apellido*?\n\n_(O envía directamente tu *ubicación actual* 📎 -> Ubicación si necesitas el taxi de inmediato)_'
      );
      return;
    }

    // Usuario ya registrado escribiendo por segunda vez o más: lo saludamos por su nombre
    await sendText(
      from,
      `🚖 *CENTRAL TAXI CALDAS:*\n👋 ¡Hola *${passengerName}*! Qué gusto saludarte de nuevo.\n\n` +
        `• 📍 Envía tu *ubicación actual* (📎 -> Ubicación) para pedir un taxi\n` +
        `• 💵 O escribe *COTIZAR* para saber el valor aproximado de un punto A a un punto B.`
    );
  } catch (err: any) {
    console.error('❌ Error procesando webhook:', err?.response?.data || err);
    if (err?.code === '42P01' || err?.code === '42703') {
      await ensureDatabaseSchema(db);
    }
  }
});

async function registerWebhookOnBoot() {
  const evoUrl = process.env.EVOLUTION_URL || 'http://evolution_api:8080';
  const apiKey = process.env.EVOLUTION_API_KEY || '';
  const instance = process.env.INSTANCE_NAME || 'central_taxi';
  const webhookUrl = 'http://backend:4000/webhook/whatsapp';
  for (let i = 1; i <= 6; i++) {
    try {
      const r = await fetch(`${evoUrl}/webhook/set/${instance}`, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT'],
          },
        }),
      });
      if (r.ok) {
        console.log('✅ Webhook vinculado automáticamente con Evolution API');
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 5000));
  }
}

ensureDatabaseSchema(db).catch((e) => console.error('❌ Error DB init:', e));

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Central de Taxis corriendo en http://localhost:${PORT}`);
  registerWebhookOnBoot();
});
