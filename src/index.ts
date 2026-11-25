import express from 'express';
import fs from 'fs';
import path from 'path';
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

function formatCOP(value: number): string {
  return `$${value.toLocaleString('es-CO')}`;
}

function formatProperName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function isConsentAccepted(upperText: string): boolean {
  const accepted = [
    'ACEPTO',
    'ACEPTAR',
    'SI',
    'SÍ',
    'AUTORIZO',
    'DE ACUERDO',
    'OK',
    '1',
  ];
  return accepted.includes(upperText.trim());
}

function isConsentRejected(upperText: string): boolean {
  return ['NO', 'NO ACEPTO', 'RECHAZO'].includes(upperText.trim());
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
  ];
  return blockedWords.includes(clean.toUpperCase());
}

function calculateEtaEstimate(distanceMeters: number | null | undefined): {
  rangeText: string;
  distanceText: string;
} {
  if (distanceMeters == null || isNaN(Number(distanceMeters)) || Number(distanceMeters) <= 0) {
    return {
      rangeText: '5 a 8 minutos',
      distanceText: 'Cerca de tu ubicación',
    };
  }
  const dist = Math.round(Number(distanceMeters));
  // Velocidad urbana promedio (~420 m/min) + margen de tráfico
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

    return { centralPhone, adminPhones, tripCommission };
  } catch {
    const centralPhone = process.env.CENTRAL_PHONE || '573133336835';
    return {
      centralPhone,
      adminPhones: [centralPhone],
      tripCommission: Number(process.env.TRIP_COMMISSION || 500),
    };
  }
}

async function findAvailableDriversInRadius(
  lng: number,
  lat: number,
  radiusMeters: number,
  minBalance: number,
  excludeDriverIds: number[] = []
) {
  const res = await db.query(
    `SELECT id, phone, full_name,
            ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)) AS distance_meters
     FROM drivers
     WHERE status = 'AVAILABLE'
       AND is_verified = TRUE
       AND approval_status = 'APPROVED'
       AND balance >= $3
       AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
       AND NOT (id = ANY($5::int[]))
     ORDER BY distance_meters ASC
     LIMIT 10`,
    [lng, lat, minBalance, radiusMeters, excludeDriverIds]
  );
  return res.rows;
}

async function broadcastTripOffer(
  drivers: Array<{ id: number; phone: string; distance_meters: string | number }>,
  tripId: number,
  tripCommission: number,
  isExpandedRing = false
) {
  const header = isExpandedRing
    ? '🚨 *NUEVO SERVICIO (ZONA AMPLIADA)*'
    : '🚨 *NUEVO SERVICIO DISPONIBLE*';

  for (const drv of drivers) {
    const currentTrip = await db.query(`SELECT status FROM trips WHERE id = $1`, [
      tripId,
    ]);
    if (currentTrip.rows[0]?.status !== 'SEARCHING') break;

    await redis.set(`offer:${drv.phone}`, tripId, 'EX', 120);
    await sendText(
      drv.phone,
      `${header}\n📍 Distancia aproximada: *${drv.distance_meters} metros*\n💸 Comisión: *${formatCOP(tripCommission)}*\n\nResponde *1* o *YO* para tomarlo.`
    );
    await new Promise((r) => setTimeout(r, 600));
  }
}

function scheduleExpandedSearch(
  tripId: number,
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
        tripId,
      ]);
      if (check.rows[0]?.status !== 'SEARCHING') return;

      const extraDrivers = await findAvailableDriversInRadius(
        lng,
        lat,
        EXPANDED_RADIUS_METERS,
        tripCommission,
        initialAlertedIds
      );

      if (extraDrivers.length > 0) {
        await sendText(
          passengerPhone,
          `🔎 Seguimos buscando tu taxi${nameTag}. Ampliamos el radio a *5 km* y acabamos de alertar a *${extraDrivers.length} conductores* adicionales...`
        );
        await broadcastTripOffer(extraDrivers, tripId, tripCommission, true);
      } else if (initialAlertedIds.length > 0) {
        await sendText(
          passengerPhone,
          `⏳ Seguimos esperando confirmación de los conductores cercanos a tu zona${nameTag}...\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
        );
      }
    } catch (err) {
      console.error(`Error en expansión de radio viaje #${tripId}:`, err);
    }
  }, EXPAND_DELAY_MS);

  setTimeout(async () => {
    try {
      const expired = await db.query(
        `UPDATE trips
         SET status = 'CANCELLED', cancelled_by = 'TIMEOUT', cancelled_at = NOW()
         WHERE id = $1 AND status = 'SEARCHING'
         RETURNING id`,
        [tripId]
      );
      if (expired.rows.length > 0) {
        await sendText(
          passengerPhone,
          `😔 Lo sentimos${nameTag}, ningún conductor pudo tomar tu solicitud en este momento. Por favor envíanos nuevamente tu *ubicación actual* para intentar de nuevo.`
        );
      }
    } catch (err) {
      console.error(`Error cerrando timeout viaje #${tripId}:`, err);
    }
  }, FINAL_TIMEOUT_MS);
}

app.get(['/', '/health'], (_req, res) =>
  res.json({ ok: true, service: 'taxi-caldas-backend' })
);

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

    const { centralPhone, adminPhones, tripCommission } =
      await getRuntimeConfig();

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
          await sendText(from, '✅ No hay conductores pendientes por aprobar.');
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
          `📋 *Conductores pendientes:*\n\n${list}\n\nPara aprobar escribe:\n*/aprobar PLACA BONO*\nEj: /aprobar ${pending.rows[0].plate} 5000`
        );
        return;
      }

      if (adminCmd === '/APROBAR') {
        const plate = (parts[1] || '').toUpperCase();
        const bonus = Math.max(0, Number(parts[2] || 0));

        if (!plate) {
          await sendText(
            from,
            '⚠️ Uso correcto: */aprobar PLACA [BONO_INICIAL]*\nEj: /aprobar ABC-123 5000'
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
            `❌ No se encontró ningún conductor con placa *${plate}*.`
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
          `✅ Conductor *${drv.full_name}* (*${drv.plate}*) aprobado.\n💰 Saldo actual: *${formatCOP(drv.balance)}*`
        );
        await sendText(
          drv.phone,
          `🎉 *¡Tu cuenta en Taxi Caldas ha sido aprobada, ${drv.full_name}!*\n\n🚕 Placa: *${drv.plate}*\n💰 Saldo disponible: *${formatCOP(drv.balance)}*\n\nPara empezar a recibir carreras, envía tu *ubicación actual* (📎 -> Ubicación).`
        );
        return;
      }

      if (adminCmd === '/RECARGAR') {
        const plate = (parts[1] || '').toUpperCase();
        const amount = Number(parts[2] || 0);

        if (!plate || isNaN(amount) || amount <= 0) {
          await sendText(
            from,
            '⚠️ Uso correcto: */recargar PLACA MONTO*\nEj: /recargar ABC-123 20000'
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
            `❌ No se encontró ningún conductor con placa *${plate}*.`
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
          `✅ Recarga exitosa de *${formatCOP(amount)}* a *${drv.full_name}* (*${drv.plate}*).\n💰 Nuevo saldo: *${formatCOP(drv.balance)}*`
        );
        await sendText(
          drv.phone,
          `💳 *¡Recarga acreditada en Taxi Caldas, ${drv.full_name}!*\n\n➕ Valor recargado: *${formatCOP(amount)}*\n💰 Nuevo saldo disponible: *${formatCOP(drv.balance)}*\n\nEnvía tu *ubicación* (📎 -> Ubicación) o escribe *ACTIVO* para recibir servicios.`
        );
        return;
      }
    }

    // 1. MODO PROXY ENMASCARADO (VIAJE ACTIVO)
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
             p.full_name AS passenger_name,
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
                .map(
                  (l) =>
                    `• ${l.sender_role === 'PASSENGER' ? 'Pasajero' : 'Conductor'}: ${l.content}`
                )
                .join('\n')
            : 'Sin mensajes previos.';

        const whoLabel =
          session.role === 'PASSENGER' ? '👤 PASAJERO' : '🚕 CONDUCTOR';
        const pickupMap = info?.pickup_lat
          ? `https://maps.google.com/?q=${info.pickup_lat},${info.pickup_lng}`
          : 'No disponible';
        const driverMap = info?.drv_lat
          ? `https://maps.google.com/?q=${info.drv_lat},${info.drv_lng}`
          : 'No disponible';

        const sosReport =
          `🆘🚨 *ALERTA DE EMERGENCIA SOS - TAXI CALDAS* 🚨🆘\n\n` +
          `Activada por: *${whoLabel}* (*${from}*)\n` +
          `Servicio ID: *#${session.tripId}*\n\n` +
          `🚕 *Vehículo:* ${info?.vehicle_model || 'N/A'} | Placa: *${info?.driver_plate || 'N/A'}*\n` +
          `👨‍✈️ *Conductor:* ${info?.driver_name || 'N/A'} (Tel: ${info?.driver_phone || 'N/A'})\n` +
          `🙋 *Pasajero:* ${info?.passenger_name || 'Sin nombre'} (${info?.passenger_phone || 'N/A'})\n\n` +
          `📍 *Punto de recogida:* ${pickupMap}\n` +
          `🛰️ *Último GPS taxi:* ${driverMap}\n\n` +
          `💬 *Últimos mensajes del chat:*\n${recentChat}`;

        for (const adminPhone of adminPhones) {
          await sendText(adminPhone, sosReport);
        }

        await sendText(
          from,
          '🆘 *Alerta SOS recibida por la Central Taxi Caldas.*\nYa notificamos de inmediato al equipo de monitoreo con los datos del vehículo, ubicación GPS y registro del viaje.'
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
            '❌ *Has cancelado tu servicio.* Si necesitas un taxi más adelante, envíanos tu ubicación.'
          );
          await sendText(
            session.peerPhone,
            `⚠️ *El pasajero canceló el servicio.*\n💸 Se reembolsaron *+${formatCOP(tripCommission)}* a tu billetera (Saldo: *${formatCOP(refundedDriver?.balance || 0)}*).\n🟢 Quedas *DISPONIBLE* para nuevas carreras.`
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
            '❌ *Has cancelado el servicio.* Quedas *DISPONIBLE* para nuevas carreras.'
          );
          await sendText(
            session.peerPhone,
            '⚠️ *El conductor canceló el servicio.* Disculpa las molestias.\n\nSi aún necesitas taxi, envíanos nuevamente tu *ubicación actual* (📎 -> Ubicación) para asignarte otro vehículo.'
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
          '✅ Servicio finalizado. Quedas *DISPONIBLE* para nuevas carreras.'
        );
        await sendText(
          session.peerPhone,
          `🏁 *¡Tu viaje ha finalizado!*\n\n¿Cómo calificarías el servicio de *${drv?.full_name || 'tu conductor'}* (*${drv?.plate || ''}*)?\n\nResponde con un número del *1* al *5*:\n⭐⭐⭐⭐⭐ *5* - Excelente\n⭐⭐⭐⭐ *4* - Muy bueno\n⭐⭐⭐ *3* - Regular\n⭐⭐ *2* - Malo\n⭐ *1* - Muy malo\n\n_(O escribe *OMITIR* para saltar)_`
        );
        return;
      }

      const prefix =
        session.role === 'PASSENGER' ? '👤 *Pasajero:*' : '🚕 *Conductor:*';

      if (text) {
        await sendText(session.peerPhone, `${prefix} ${text}`);
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'TEXT', $5)`,
          [session.tripId, session.role, from, session.peerPhone, text]
        );
      } else if (imageMsg) {
        const media = await getMediaBase64(data);
        const caption = imageMsg.caption ? `${prefix} ${imageMsg.caption}` : prefix;
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
        const caption = videoMsg.caption ? `${prefix} ${videoMsg.caption}` : prefix;
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
        await sendAudio(session.peerPhone, media.base64);
        await db.query(
          `INSERT INTO chat_logs (trip_id, sender_role, sender_phone, receiver_phone, message_type, content) VALUES ($1, $2, $3, $4, 'AUDIO', '[Nota de voz]')`,
          [session.tripId, session.role, from, session.peerPhone]
        );
      } else if (location) {
        await sendLocation(
          session.peerPhone,
          location.degreesLatitude,
          location.degreesLongitude,
          'Ubicación actualizada'
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
          '👌 Calificación omitida. Cuando necesites otro taxi, envíanos tu ubicación.'
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
            `🙏 *¡Gracias por tu calificación de ${score}/5!*\nTu opinión nos ayuda a mantener el mejor servicio en *Taxi Caldas*.`
          );

          const updatedDrv = drvUpdate.rows[0];
          if (updatedDrv) {
            await sendText(
              updatedDrv.phone,
              `⭐ *¡Recibiste una calificación de ${score}/5!*\nTu promedio actual es *${updatedDrv.rating_avg} ⭐* (${updatedDrv.rating_count} viajes calificados).`
            );
          }

          if (score <= 2) {
            for (const adminPhone of adminPhones) {
              await sendText(
                adminPhone,
                `⚠️ *ALERTA DE CALIFICACIÓN BAJA (${score}/5)*\n\n🚕 Conductor: *${rateState.driverName}* (*${rateState.plate}*)\n🧾 Viaje ID: *#${rateState.tripId}*\n👤 Pasajero: *${from}*`
              );
            }
          }
          return;
        }

        if (/HOLA|TAXI|NECESITO|SERVICIO|PIDO/i.test(upperText)) {
          await redis.del(`rate:${from}`);
        } else {
          await sendText(
            from,
            '⭐ Por favor responde con un número del *1* al *5* para calificar tu último viaje, o escribe *OMITIR*.'
          );
          return;
        }
      }
    }

    // 2. FLUJO DE CONDUCTOR YA REGISTRADO EN BASE DE DATOS
    const driverRes = await db.query(`SELECT * FROM drivers WHERE phone = $1`, [
      from,
    ]);
    if (driverRes.rows.length > 0) {
      const driver = driverRes.rows[0];
      const cmd = upperText;

      if (!driver.is_verified || driver.approval_status !== 'APPROVED') {
        await sendText(
          from,
          `⏳ Hola *${driver.full_name}*, tu registro para el vehículo *${driver.plate}* está en revisión. Te avisaremos por aquí en cuanto sea aprobado.`
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
          `💰 *Tu Billetera Prepago, ${driver.full_name}*\n\nSaldo actual: *${formatCOP(driver.balance)}*\nCalificación: *${driver.rating_avg || '5.00'} ⭐*\nComisión por servicio: *${formatCOP(tripCommission)}*\n\n*Últimos movimientos:*\n${history}\n\nPara recargar, transfiere vía Nequi/Llave al *${centralPhone.replace(/^57/, '')}* indicando tu placa *${driver.plate}*.`
        );
        return;
      }

      if (cmd === 'PAUSA') {
        await db.query(`UPDATE drivers SET status = 'OFFLINE' WHERE id = $1`, [
          driver.id,
        ]);
        await sendText(
          from,
          `🔴 Turno pausado, *${driver.full_name}*. Escribe *ACTIVO* o envía tu ubicación cuando vuelvas a operar.`
        );
        return;
      }

      if (cmd === 'ACTIVO' || location) {
        if (driver.balance < tripCommission) {
          await sendText(
            from,
            `⚠️ *Saldo insuficiente para operar*\n\nTu saldo actual es *${formatCOP(driver.balance)}* y el mínimo requerido por carrera es *${formatCOP(tripCommission)}*.\n\nRecarga tu cuenta vía Nequi/Llave al *${centralPhone.replace(/^57/, '')}* enviando tu placa *${driver.plate}*.`
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
          `🟢 Estás *DISPONIBLE*, *${driver.full_name}* (Saldo: *${formatCOP(driver.balance)}*).\nEnvíame tu ubicación actual (📎 -> Ubicación) para recibir servicios cercanos.`
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
          `📍 Ubicación GPS actualizada, *${driver.full_name}* (Saldo: *${formatCOP(driver.balance)}*). Buscando pasajeros cerca de ti...`
        );
        return;
      }

      const pendingTripId = await redis.get(`offer:${from}`);
      if (pendingTripId && (cmd === '1' || cmd === 'YO')) {
        if (driver.balance < tripCommission) {
          await sendText(
            from,
            `⚠️ No tienes saldo suficiente (*${formatCOP(driver.balance)}*) para tomar esta carrera. Escribe *SALDO* para ver cómo recargar.`
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
            '⚠️ Lo sentimos, otro conductor acaba de tomar este servicio.'
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
              '⚠️ Este servicio ya fue cancelado por el pasajero o tomado.'
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
            await sendText(from, '⚠️ Saldo insuficiente para tomar el servicio.');
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

        const [passRes, completedRes] = await Promise.all([
          db.query(`SELECT full_name FROM passengers WHERE phone = $1`, [
            trip.passenger_phone,
          ]),
          db.query(
            `SELECT COUNT(*)::int AS total FROM trips WHERE driver_id = $1 AND status = 'COMPLETED'`,
            [driver.id]
          ),
        ]);

        const passengerName = passRes.rows[0]?.full_name || null;
        const completedTrips = completedRes.rows[0]?.total || 0;
        const eta = calculateEtaEstimate(distanceMeters);

        await redis.del(`offer:${from}`);
        await redis.set(
          `session:${trip.passenger_phone}`,
          JSON.stringify({ tripId: trip.id, role: 'PASSENGER', peerPhone: from }),
          'EX',
          7200
        );
        await redis.set(
          `session:${from}`,
          JSON.stringify({
            tripId: trip.id,
            role: 'DRIVER',
            peerPhone: trip.passenger_phone,
          }),
          'EX',
          7200
        );

        const passengerCardText =
          `✅ *¡Taxi asignado${passengerName ? `, ${passengerName}` : ''}!*\n\n` +
          `⏱️ *Tiempo estimado de llegada:* *${eta.rangeText}* (${eta.distanceText})\n\n` +
          `👨‍✈️ *Perfil del Conductor:*\n` +
          `• *Nombre:* ${driver.full_name}\n` +
          `• *Calificación:* ${driver.rating_avg || '5.00'} ⭐ (${driver.rating_count || 0} calif.)\n` +
          `• *Servicios completados:* ${completedTrips}\n` +
          `• *Estado:* Verificado ✅\n\n` +
          `🚕 *Datos del Vehículo:*\n` +
          `• *Vehículo:* ${driver.vehicle_model}\n` +
          `• *Placa:* *${driver.plate}*\n\n` +
          `🔒 Tu número permanece privado. Puedes enviar mensajes, fotos o notas de voz por este chat.\n` +
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

        await sendText(
          from,
          `✅ *¡Servicio asignado a ti!*\n👤 Pasajero: *${passengerName || 'Cliente Taxi Caldas'}*\n⏱️ Tiempo estimado al punto: *${eta.rangeText}*\n💸 Comisión descontada: *-${formatCOP(tripCommission)}*\n💰 Saldo restante: *${formatCOP(newBalance)}*\n\nEscribe o envía audios/fotos por aquí para hablar con el pasajero.\n• *FIN* - Terminar viaje\n• *CANCELAR* - Cancelar servicio\n• *SOS* - Emergencia`
        );
        await sendLocation(from, trip.lat, trip.lng, 'Punto de recogida');
        return;
      }

      await sendText(
        from,
        `🚕 Hola *${driver.full_name}* (*${driver.plate}*) | ${driver.rating_avg || '5.00'} ⭐\n\nComandos disponibles:\n• Envía tu *ubicación* (📎 -> Ubicación) para activar turno\n• *SALDO* - Ver saldo y movimientos\n• *PAUSA* - Pausar turno`
      );
      return;
    }

    // 3. FLUJO DE AUTO-REGISTRO DE NUEVO TAXISTA CON HABEAS DATA Y FOTO DE PERFIL
    const regRaw = await redis.get(`reg:${from}`);

    if (upperText === 'CANCELAR' && regRaw) {
      await redis.del(`reg:${from}`);
      await sendText(
        from,
        '❌ Registro cancelado. Si deseas pedir un taxi, escríbenos *HOLA*.'
      );
      return;
    }

    if (
      !regRaw &&
      (upperText === 'SOY TAXISTA' ||
        upperText === 'REGISTRO' ||
        upperText === 'REGISTRARME')
    ) {
      await redis.del(`consent_pending:${from}`, `ask_name:${from}`);
      await redis.set(
        `reg:${from}`,
        JSON.stringify({ step: 'ASK_CONSENT' }),
        'EX',
        1800
      );
      await sendText(
        from,
        '🚕 *Afiliación de Conductores - Taxi Caldas*\n\n' +
          '📋 *Autorización de Tratamiento de Datos (Ley 1581 de 2012):*\n' +
          'Para validar tu identidad, vehículo, documentos, foto de perfil y ubicación GPS durante los servicios, autorizas a *Taxi Caldas* el tratamiento de tus datos personales conforme a nuestra política de privacidad. Puedes conocer, actualizar o suprimir tus datos en cualquier momento.\n\n' +
          '👉 Responde *ACEPTO* (o *1*) para iniciar tu registro, o *CANCELAR* para salir.'
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
            'ℹ️ Entendido. Sin autorización de tratamiento de datos no podemos registrar tu perfil de conductor en *Taxi Caldas*.'
          );
          return;
        }
        if (!isConsentAccepted(upperText)) {
          await sendText(
            from,
            '📋 Por favor responde *ACEPTO* (o *1*) para autorizar el tratamiento de tus datos personales y continuar con tu registro, o escribe *CANCELAR*.'
          );
          return;
        }

        regState.dataConsent = true;
        regState.dataConsentAt = new Date().toISOString();
        regState.step = 'ASK_NAME';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '✅ *Autorización registrada.*\n\nVamos a completar tu perfil en 5 pasos rápidos:\n1️⃣ Por favor escribe tu *nombre y apellido*:'
        );
        return;
      }

      if (regState.step === 'ASK_NAME') {
        if (text.length < 3) {
          await sendText(
            from,
            '⚠️ Por favor escribe tu nombre completo (mínimo 3 letras):'
          );
          return;
        }
        regState.fullName = formatProperName(text);
        regState.step = 'ASK_PLATE';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          `2️⃣ Gracias *${regState.fullName}*. Ahora escribe la *placa* de tu taxi (Ej: *WXY-123*):`
        );
        return;
      }

      if (regState.step === 'ASK_PLATE') {
        const cleanPlate = text.toUpperCase().replace(/\s+/g, '');
        if (cleanPlate.length < 5) {
          await sendText(
            from,
            '⚠️ Placa no válida. Escríbela nuevamente (Ej: *WXY-123*):'
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
            `⚠️ La placa *${cleanPlate}* ya está registrada. Escribe otra placa o *CANCELAR*:`
          );
          return;
        }
        regState.plate = cleanPlate;
        regState.step = 'ASK_MODEL';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '3️⃣ Escribe la *marca, línea y color* del vehículo (Ej: *Kia Picanto Amarillo*):'
        );
        return;
      }

      if (regState.step === 'ASK_MODEL') {
        if (text.length < 3) {
          await sendText(
            from,
            '⚠️ Indica el modelo y color del vehículo (Ej: *Hyundai i10 Amarillo*):'
          );
          return;
        }
        regState.vehicleModel = text;
        regState.step = 'ASK_PROFILE_PHOTO';
        await redis.set(`reg:${from}`, JSON.stringify(regState), 'EX', 1800);
        await sendText(
          from,
          '4️⃣ Ahora envía una *foto tipo selfie clara de tu rostro* (📎 -> Cámara o Galería).\n_Esta foto será mostrada a los pasajeros cuando aceptes un servicio para su seguridad._'
        );
        return;
      }

      if (regState.step === 'ASK_PROFILE_PHOTO') {
        if (!imageMsg) {
          await sendText(
            from,
            '🤳 Por favor adjunta una *foto de tu rostro* (imagen) para tu perfil de conductor, o escribe *CANCELAR*:'
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
          '5️⃣ ¡Foto de perfil guardada! Por último, envía una *foto clara de tu Tarjetón / Licencia de conducción o Tarjeta de Propiedad* (📎 -> Cámara o Galería):'
        );
        return;
      }

      if (regState.step === 'ASK_DOC_PHOTO') {
        if (!imageMsg && !docMsg) {
          await sendText(
            from,
            '📸 Por favor adjunta una *foto* de tus documentos (no texto) para completar el registro, o escribe *CANCELAR*:'
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
          `✅ *¡Solicitud de registro completada, ${regState.fullName}!*\n\n🔢 Placa: *${regState.plate}*\n🚕 Vehículo: *${regState.vehicleModel}*\n📋 Habeas Data: *Autorizado*\n\nValidaremos tu foto de perfil y documentos, y te activaremos por este mismo chat.`
        );

        const adminPhone = adminPhones[0];
        if (adminPhone) {
          const summary = `🆕 *NUEVO TAXISTA REGISTRADO*\n\n👤 Nombre: *${regState.fullName}*\n📱 Teléfono: *${from}*\n🔢 Placa: *${regState.plate}*\n🚕 Vehículo: *${regState.vehicleModel}*\n\nPara aprobarlo y darle saldo inicial responde:\n*/aprobar ${regState.plate} 5000*`;
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

    // 4. VERIFICACIÓN PREVIA DE HABEAS DATA (LEY 1581 DE 2012) PARA CLIENTES / PASAJEROS
    const passengerRes = await db.query(
      `SELECT * FROM passengers WHERE phone = $1`,
      [from]
    );
    let passenger = passengerRes.rows[0] || null;

    if (upperText === 'ELIMINAR MIS DATOS' || upperText === 'REVOCAR DATOS') {
      await db.query(`DELETE FROM passengers WHERE phone = $1`, [from]);
      await redis.del(`consent_pending:${from}`, `ask_name:${from}`);
      await sendText(
        from,
        '🗑️ Tus datos personales han sido eliminados de nuestra base de datos conforme a la Ley 1581 de 2012. Si deseas volver a usar *Taxi Caldas* más adelante, escríbenos *HOLA*.'
      );
      return;
    }

    if (!passenger || !passenger.data_consent) {
      const pendingConsent = await redis.get(`consent_pending:${from}`);

      if (pendingConsent) {
        if (isConsentRejected(upperText)) {
          await redis.del(`consent_pending:${from}`);
          await sendText(
            from,
            'ℹ️ Entendido. Sin tu autorización de tratamiento de datos no podemos registrar tu perfil ni gestionar servicios en *Taxi Caldas*. Cuando desees autorizar, escríbenos *HOLA*.'
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
              '✅ *¡Autorización registrada!* Gracias por confiar en *Taxi Caldas*.\n\nPara brindarte una atención personalizada, ¿cuál es tu *nombre y apellido*? 😊'
            );
            return;
          }
        } else {
          await sendText(
            from,
            '📋 Para continuar en *Taxi Caldas* y cumplir con la Ley 1581 de 2012 (Habeas Data), por favor responde *ACEPTO* (o *1*) autorizando el tratamiento de tus datos personales para gestionar tus servicios de taxi.'
          );
          return;
        }
      } else {
        await redis.set(`consent_pending:${from}`, '1', 'EX', 3600);
        await sendText(
          from,
          '👋 ¡Hola! Bienvenido a *Taxi Caldas*.\n\n' +
            '📋 *Aviso de Protección de Datos (Ley 1581 de 2012):*\n' +
            'Para gestionar tu solicitud de taxi, seguridad GPS e historial de viajes, autorizas a *Taxi Caldas* el tratamiento de tus datos personales conforme a nuestra política de privacidad. Podrás conocer, actualizar o suprimir tus datos en cualquier momento.\n\n' +
            '👉 Responde *ACEPTO* (o *1*) para continuar.\n' +
            '_(Si eres conductor y deseas afiliarte, escribe *SOY TAXISTA*)_'
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

    const passengerName: string | null = passenger?.full_name || null;

    if (upperText === 'CANCELAR') {
      await redis.del(`ask_name:${from}`);
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
          `❌ Hemos cancelado tu búsqueda de taxi${passengerName ? `, *${passengerName}*` : ''}.`
        );
      } else {
        await sendText(
          from,
          `ℹ️ No tienes ningún servicio activo para cancelar${passengerName ? `, *${passengerName}*` : ''}. Envía tu *ubicación actual* para pedir un taxi.`
        );
      }
      return;
    }

    // Verificar si el pasajero ya tiene una búsqueda o viaje activo
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
          }),
          'EX',
          7200
        );
        await sendText(
          from,
          `🚕 ${passengerName ? `*${passengerName}*, ya` : 'Ya'} tienes un taxi asignado en curso (*${existing.driver_plate}* - ${existing.driver_name}).\nPuedes escribirle directamente por aquí o enviar *CANCELAR* si deseas anularlo.`
        );
        return;
      }

      if (location) {
        await sendText(
          from,
          `⏳ *Ya tienes una solicitud de taxi en curso (Servicio #${existing.id})${passengerName ? `, ${passengerName}` : ''}.*\nEstamos alertando a los conductores cercanos. Por favor espera un momento o escribe *CANCELAR* si deseas anularla antes de pedir otro.`
        );
      } else {
        await sendText(
          from,
          `⏳ Seguimos buscando un taxi cercano para tu solicitud *#${existing.id}*${passengerName ? `, *${passengerName}*` : ''}. Te avisaremos apenas un conductor acepte.\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
        );
      }
      return;
    }

    // Si envía ubicación GPS: despachar de inmediato
    if (location) {
      await redis.del(`ask_name:${from}`);

      const reqLock = await redis.set(
        `passenger:req_lock:${from}`,
        '1',
        'EX',
        5,
        'NX'
      );
      if (!reqLock) {
        await sendText(from, '⏳ Procesando tu ubicación, un momento por favor...');
        return;
      }

      const lat = location.degreesLatitude;
      const lng = location.degreesLongitude;

      let nearbyDrivers = await findAvailableDriversInRadius(
        lng,
        lat,
        INITIAL_RADIUS_METERS,
        tripCommission
      );
      let usedExpandedImmediately = false;

      if (nearbyDrivers.length === 0) {
        nearbyDrivers = await findAvailableDriversInRadius(
          lng,
          lat,
          EXPANDED_RADIUS_METERS,
          tripCommission
        );
        usedExpandedImmediately = true;
      }

      if (nearbyDrivers.length === 0) {
        await sendText(
          from,
          `😔 Lo sentimos${passengerName ? ` *${passengerName}*` : ''}, no encontramos taxis disponibles a menos de 5 km de tu ubicación en este momento. Intenta nuevamente en un par de minutos.`
        );
        return;
      }

      let tripId: number;
      try {
        const newTrip = await db.query(
          `INSERT INTO trips (passenger_phone, pickup_location) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) RETURNING id`,
          [from, lng, lat]
        );
        tripId = newTrip.rows[0].id;
        await db.query(
          `UPDATE passengers SET trips_count = trips_count + 1 WHERE phone = $1`,
          [from]
        );
      } catch (insertErr: any) {
        if (insertErr?.code === '23505') {
          await sendText(
            from,
            '⏳ Ya tienes una solicitud de taxi activa en este momento. Escribe *CANCELAR* si deseas detenerla.'
          );
          return;
        }
        throw insertErr;
      }

      const greetingPrefix = passengerName
        ? `🔎 ¡Listo *${passengerName}*! Ubicación recibida.`
        : '🔎 Ubicación recibida.';

      await sendText(
        from,
        usedExpandedImmediately
          ? `${greetingPrefix} Estamos alertando a *${nearbyDrivers.length} conductores* en un radio de *5 km*...\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
          : `${greetingPrefix} Estamos alertando a *${nearbyDrivers.length} conductores* cercanos a tu zona...\n_(Escribe *CANCELAR* si deseas detener la búsqueda)_`
      );

      await broadcastTripOffer(
        nearbyDrivers,
        tripId,
        tripCommission,
        usedExpandedImmediately
      );

      const alertedIds = nearbyDrivers.map((d) => d.id);
      scheduleExpandedSearch(
        tripId,
        from,
        passengerName,
        lng,
        lat,
        tripCommission,
        alertedIds
      );
      return;
    }

    // 5. CAPTURA O SALUDO PERSONALIZADO POR NOMBRE PARA CLIENTES CON HABEAS DATA ACEPTADO
    if (!passengerName) {
      const waitingName = await redis.get(`ask_name:${from}`);

      if (waitingName && text) {
        if (isInvalidNameInput(text)) {
          await sendText(
            from,
            '😊 Para completar tu registro en *Taxi Caldas* y llamarte por tu nombre, dime por favor cómo te llamas *(Ej: Carlos Pérez)*:\n\n_(O envía directamente tu *ubicación actual* 📎 -> Ubicación si necesitas el taxi de inmediato)_'
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
          `🙌 ¡Mucho gusto, *${formattedName}*! Ya quedaste registrado en *Taxi Caldas*.\n\n📍 Cuando necesites un servicio, solo envíame tu *ubicación actual* (📎 -> Ubicación) y te asignaremos el taxi más cercano.`
        );
        return;
      }

      await redis.set(`ask_name:${from}`, '1', 'EX', 3600);
      await sendText(
        from,
        '😊 Para brindarte una atención personalizada en *Taxi Caldas*, ¿cuál es tu *nombre y apellido*?\n\n_(O envía directamente tu *ubicación actual* 📎 -> Ubicación si necesitas el taxi de inmediato)_'
      );
      return;
    }

    // Cliente ya registrado escribiendo por segunda vez o más: lo saludamos por su nombre
    await sendText(
      from,
      `👋 ¡Hola *${passengerName}*! Qué gusto saludarte de nuevo en *Taxi Caldas*.\n\n📍 Envíame tu *ubicación actual* (📎 -> Ubicación) para enviarte el taxi más cercano.`
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
