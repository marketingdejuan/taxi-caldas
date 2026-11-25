import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const tripId = req.nextUrl.searchParams.get('tripId');
  if (!tripId) {
    return NextResponse.json({ error: 'tripId requerido' }, { status: 400 });
  }

  try {
    const res = await db.query(
      `SELECT id, trip_id, sender_role, sender_phone, receiver_phone, message_type, content, created_at
       FROM chat_logs
       WHERE trip_id = $1
       ORDER BY created_at ASC`,
      [Number(tripId)]
    );
    return NextResponse.json({ messages: res.rows });
  } catch (error) {
    console.error('Error cargando mensajes:', error);
    return NextResponse.json(
      { error: 'Error cargando historial de chat' },
      { status: 500 }
    );
  }
}
