import { NextRequest, NextResponse } from 'next/server';
import { db, sendWhatsAppNotification } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, driverId, amount } = body;

    if (!driverId || !action) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    if (action === 'APPROVE') {
      const bonus = Math.max(0, Number(amount || 0));
      const res = await db.query(
        `UPDATE drivers
         SET is_verified = TRUE, approval_status = 'APPROVED', balance = balance + $1
         WHERE id = $2
         RETURNING *`,
        [bonus, driverId]
      );

      const drv = res.rows[0];
      if (!drv) {
        return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
      }

      if (bonus > 0) {
        await db.query(
          `INSERT INTO wallet_transactions (driver_id, amount, type, description)
           VALUES ($1, $2, 'BONUS', 'Bono inicial aprobado desde Taxi Caldas Web')`,
          [drv.id, bonus]
        );
      }

      await sendWhatsAppNotification(
        drv.phone,
        `🎉 *¡Tu cuenta en Taxi Caldas ha sido aprobada!*\n\n🚕 Placa: *${drv.plate}*\n💰 Saldo disponible: *$${Number(drv.balance).toLocaleString('es-CO')}*\n\nPara empezar a recibir carreras, envía tu *ubicación actual* (📎 -> Ubicación).`
      );

      return NextResponse.json({ ok: true, driver: drv });
    }

    if (action === 'REJECT') {
      const res = await db.query(
        `UPDATE drivers
         SET is_verified = FALSE, approval_status = 'REJECTED', status = 'OFFLINE'
         WHERE id = $1
         RETURNING *`,
        [driverId]
      );
      const drv = res.rows[0];
      if (drv) {
        await sendWhatsAppNotification(
          drv.phone,
          `⚠️ Tu solicitud de registro en *Taxi Caldas* para la placa *${drv.plate}* fue rechazada por documentación incompleta. Escribe *SOY TAXISTA* para intentarlo nuevamente.`
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'TOPUP') {
      const topup = Number(amount || 0);
      if (isNaN(topup) || topup <= 0) {
        return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
      }

      const res = await db.query(
        `UPDATE drivers SET balance = balance + $1 WHERE id = $2 RETURNING *`,
        [topup, driverId]
      );
      const drv = res.rows[0];
      if (!drv) {
        return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
      }

      await db.query(
        `INSERT INTO wallet_transactions (driver_id, amount, type, description)
         VALUES ($1, $2, 'TOPUP', 'Recarga acreditada desde Taxi Caldas Web')`,
        [drv.id, topup]
      );

      await sendWhatsAppNotification(
        drv.phone,
        `💳 *¡Recarga acreditada en Taxi Caldas!*\n\n➕ Valor: *$${topup.toLocaleString('es-CO')}*\n💰 Nuevo saldo: *$${Number(drv.balance).toLocaleString('es-CO')}*\n\nEnvía tu *ubicación* (📎 -> Ubicación) o escribe *ACTIVO* para recibir servicios.`
      );

      return NextResponse.json({ ok: true, driver: drv });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    console.error('Error en /api/drivers/action:', error);
    return NextResponse.json(
      { error: 'Error ejecutando acción' },
      { status: 500 }
    );
  }
}
