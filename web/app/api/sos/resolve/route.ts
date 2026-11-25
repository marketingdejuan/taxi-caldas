import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { alertId } = await req.json();
    if (!alertId) {
      return NextResponse.json({ error: 'alertId requerido' }, { status: 400 });
    }

    await db.query(
      `UPDATE sos_alerts
       SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = $1
       WHERE id = $2`,
      [user, Number(alertId)]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error resolviendo alerta SOS:', error);
    return NextResponse.json(
      { error: 'Error actualizando alerta SOS' },
      { status: 500 }
    );
  }
}
