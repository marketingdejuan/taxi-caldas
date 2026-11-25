import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const [driversRes, tripsRes, revenueRes, sosRes] = await Promise.all([
      db.query(`
        SELECT
          id,
          phone,
          full_name,
          plate,
          vehicle_model,
          status,
          balance,
          approval_status,
          is_verified,
          doc_photo_path,
          rating_avg,
          rating_count,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng,
          last_location_at,
          created_at
        FROM drivers
        ORDER BY
          CASE WHEN approval_status = 'PENDING' THEN 0 ELSE 1 END,
          created_at DESC
      `),
      db.query(`
        SELECT
          t.id,
          t.passenger_phone,
          t.status,
          t.rating,
          t.cancelled_by,
          t.created_at,
          t.accepted_at,
          t.completed_at,
          ST_Y(t.pickup_location::geometry) AS lat,
          ST_X(t.pickup_location::geometry) AS lng,
          d.full_name AS driver_name,
          d.plate AS driver_plate,
          d.phone AS driver_phone,
          (SELECT COUNT(*)::int FROM chat_logs c WHERE c.trip_id = t.id) AS message_count
        FROM trips t
        LEFT JOIN drivers d ON t.driver_id = d.id
        ORDER BY t.created_at DESC
        LIMIT 50
      `),
      db.query(`
        SELECT COALESCE(SUM(ABS(amount)), 0)::int AS today_revenue
        FROM wallet_transactions
        WHERE type = 'COMMISSION'
          AND created_at >= CURRENT_DATE
      `),
      db.query(`
        SELECT
          s.id,
          s.trip_id,
          s.triggered_by,
          s.trigger_phone,
          s.status,
          s.created_at,
          t.passenger_phone,
          ST_Y(t.pickup_location::geometry) AS pickup_lat,
          ST_X(t.pickup_location::geometry) AS pickup_lng,
          d.full_name AS driver_name,
          d.plate AS driver_plate,
          d.phone AS driver_phone,
          d.vehicle_model,
          ST_Y(d.location::geometry) AS drv_lat,
          ST_X(d.location::geometry) AS drv_lng
        FROM sos_alerts s
        LEFT JOIN trips t ON s.trip_id = t.id
        LEFT JOIN drivers d ON t.driver_id = d.id
        WHERE s.status = 'OPEN'
        ORDER BY s.created_at DESC
      `),
    ]);

    const drivers = driversRes.rows;
    const trips = tripsRes.rows;
    const sosAlerts = sosRes.rows;

    const stats = {
      availableDrivers: drivers.filter(
        (d) => d.status === 'AVAILABLE' && d.approval_status === 'APPROVED'
      ).length,
      busyDrivers: drivers.filter((d) => d.status === 'BUSY').length,
      pendingApprovals: drivers.filter((d) => d.approval_status === 'PENDING')
        .length,
      activeTrips: trips.filter(
        (t) => t.status === 'ACTIVE' || t.status === 'SEARCHING'
      ).length,
      completedToday: trips.filter((t) => t.status === 'COMPLETED').length,
      todayRevenue: revenueRes.rows[0]?.today_revenue || 0,
    };

    return NextResponse.json({ stats, drivers, trips, sosAlerts });
  } catch (error) {
    console.error('Error en /api/dashboard:', error);
    return NextResponse.json(
      { error: 'Error consultando la base de datos' },
      { status: 500 }
    );
  }
}
