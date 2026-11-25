import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE = process.env.INSTANCE_NAME || 'central_taxi';
const WEBHOOK_URL =
  process.env.BACKEND_WEBHOOK_URL ||
  'http://backend:4000/webhook/whatsapp';

async function evoFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${EVOLUTION_URL}${endpoint}`, {
    ...options,
    headers: {
      apikey: API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

async function ensureWebhook() {
  await evoFetch(`/webhook/set/${INSTANCE}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: WEBHOOK_URL,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      },
    }),
  });
}

async function getSettingsMap(): Promise<Record<string, string>> {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    const res = await db.query(`SELECT key, value FROM app_settings`);
    const map: Record<string, string> = {};
    for (const row of res.rows) {
      map[row.key] = row.value;
    }
    return map;
  } catch (err) {
    console.error('Aviso leyendo app_settings:', err);
    return {};
  }
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const [stateRes, instancesRes, settings] = await Promise.all([
      evoFetch(`/instance/connectionState/${INSTANCE}`),
      evoFetch(`/instance/fetchInstances`),
      getSettingsMap(),
    ]);

    let instanceInfo: any = null;
    if (Array.isArray(instancesRes.data)) {
      instanceInfo =
        instancesRes.data.find(
          (i: any) => i.name === INSTANCE || i.instanceName === INSTANCE
        ) || null;
    } else if (instancesRes.data?.instance) {
      instanceInfo = instancesRes.data.instance;
    }

    const stateFromEndpoint =
      stateRes.data?.instance?.state || stateRes.data?.state || '';
    const stateFromList =
      instanceInfo?.connectionStatus || instanceInfo?.status || '';

    let state = 'close';
    if (stateFromEndpoint === 'open' || stateFromList === 'open') {
      state = 'open';
    } else if (
      stateFromEndpoint === 'connecting' ||
      stateFromList === 'connecting'
    ) {
      state = 'connecting';
    }

    const ownerJid: string =
      instanceInfo?.ownerJid ||
      instanceInfo?.owner ||
      stateRes.data?.instance?.owner ||
      '';
    const connectedPhone = ownerJid
      ? ownerJid.split('@')[0].split(':')[0]
      : null;
    const profileName =
      instanceInfo?.profileName ||
      instanceInfo?.instance?.profileName ||
      null;

    if (state === 'open') {
      await ensureWebhook();

      if (connectedPhone && settings.central_phone !== connectedPhone) {
        await db.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ('central_phone', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [connectedPhone]
        );
        settings.central_phone = connectedPhone;

        const currentAdmins = (settings.admin_phones || '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);

        if (!currentAdmins.includes(connectedPhone)) {
          const updatedAdmins = [...currentAdmins, connectedPhone].join(',');
          await db.query(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ('admin_phones', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
            [updatedAdmins]
          );
          settings.admin_phones = updatedAdmins;
        }
      }
    }

    return NextResponse.json({
      instanceName: INSTANCE,
      state,
      connectedPhone,
      profileName,
      settings: {
        centralPhone: settings.central_phone || '',
        adminPhones: settings.admin_phones || '573133336835',
        tripCommission: Number(settings.trip_commission || 500),
      },
    });
  } catch (error) {
    console.error('Error en GET /api/whatsapp:', error);
    return NextResponse.json(
      { error: 'Error consultando estado de WhatsApp' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, adminPhones, tripCommission } = body;

    if (action === 'SAVE_SETTINGS') {
      if (typeof adminPhones === 'string') {
        const cleaned = adminPhones
          .split(',')
          .map((p) => p.replace(/\D/g, '').trim())
          .filter(Boolean)
          .join(',');

        await db.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ('admin_phones', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [cleaned]
        );
      }

      if (tripCommission !== undefined && !isNaN(Number(tripCommission))) {
        await db.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ('trip_commission', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [String(Math.max(0, Number(tripCommission)))]
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'RESTART') {
      await evoFetch(`/instance/restart/${INSTANCE}`, { method: 'POST' });
      await evoFetch(`/instance/restart/${INSTANCE}`, { method: 'PUT' });
      await ensureWebhook();
      return NextResponse.json({ ok: true });
    }

    if (action === 'UNLINK') {
      await evoFetch(`/instance/logout/${INSTANCE}`, { method: 'DELETE' });
      await evoFetch(`/instance/delete/${INSTANCE}`, { method: 'DELETE' });
      await db.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('central_phone', '', NOW())
         ON CONFLICT (key) DO UPDATE SET value = '', updated_at = NOW()`
      );
      return NextResponse.json({ ok: true, unlinked: true });
    }

    if (action === 'SWITCH_NUMBER' || action === 'GET_QR') {
      await evoFetch(`/instance/logout/${INSTANCE}`, { method: 'DELETE' });
      await evoFetch(`/instance/delete/${INSTANCE}`, { method: 'DELETE' });
      await new Promise((r) => setTimeout(r, 1200));

      const connectRes = await evoFetch(`/instance/create`, {
        method: 'POST',
        body: JSON.stringify({
          instanceName: INSTANCE,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      await ensureWebhook();

      const rawQr: string | null =
        connectRes.data?.base64 ||
        connectRes.data?.qrcode?.base64 ||
        null;

      const qrBase64 = rawQr
        ? rawQr.startsWith('data:image')
          ? rawQr
          : `data:image/png;base64,${rawQr}`
        : null;

      return NextResponse.json({
        ok: true,
        qrBase64,
        pairingCode: connectRes.data?.pairingCode || null,
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    console.error('Error en POST /api/whatsapp:', error);
    return NextResponse.json(
      { error: 'Error procesando solicitud de WhatsApp' },
      { status: 500 }
    );
  }
}
