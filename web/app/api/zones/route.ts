import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://backend:4000';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/admin/zones`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error en GET /api/zones:', error);
    return NextResponse.json({ error: 'Error consultando zonas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, id, ...payload } = body;

    if (action === 'UPDATE' && id) {
      const res = await fetch(`${BACKEND_URL}/admin/zones/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    if (action === 'DELETE' && id) {
      const res = await fetch(`${BACKEND_URL}/admin/zones/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const res = await fetch(`${BACKEND_URL}/admin/zones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error en POST /api/zones:', error);
    return NextResponse.json({ error: 'Error guardando zona' }, { status: 500 });
  }
}
