import { Pool } from 'pg';

export async function ensureDatabaseSchema(db: Pool) {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS postgis;

    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      plate VARCHAR(15) UNIQUE NOT NULL,
      vehicle_model VARCHAR(50),
      status VARCHAR(20) DEFAULT 'OFFLINE',
      location GEOGRAPHY(Point, 4326),
      last_location_at TIMESTAMP WITH TIME ZONE,
      is_verified BOOLEAN DEFAULT FALSE,
      approval_status VARCHAR(20) DEFAULT 'PENDING',
      balance INTEGER DEFAULT 0,
      doc_photo_path TEXT,
      rating_avg NUMERIC(3,2) DEFAULT 5.00,
      rating_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers USING GIST (location);
    CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);

    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      passenger_phone VARCHAR(20) NOT NULL,
      driver_id INTEGER REFERENCES drivers(id),
      pickup_location GEOGRAPHY(Point, 4326) NOT NULL,
      pickup_address TEXT,
      status VARCHAR(20) DEFAULT 'SEARCHING',
      rating INTEGER,
      cancelled_by VARCHAR(20),
      cancelled_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      accepted_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_trip_per_passenger
    ON trips (passenger_phone)
    WHERE status IN ('SEARCHING', 'ACTIVE');

    CREATE TABLE IF NOT EXISTS chat_logs (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER REFERENCES trips(id),
      sender_role VARCHAR(15) NOT NULL,
      sender_phone VARCHAR(20) NOT NULL,
      receiver_phone VARCHAR(20) NOT NULL,
      message_type VARCHAR(20) DEFAULT 'TEXT',
      content TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER REFERENCES drivers(id),
      amount INTEGER NOT NULL,
      type VARCHAR(20) NOT NULL,
      trip_id INTEGER REFERENCES trips(id),
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sos_alerts (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER REFERENCES trips(id),
      triggered_by VARCHAR(20) NOT NULL,
      trigger_phone VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'OPEN',
      resolved_at TIMESTAMP WITH TIME ZONE,
      resolved_by VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    INSERT INTO app_settings (key, value) VALUES
      ('central_phone', '573133336835'),
      ('admin_phones', '573133336835'),
      ('trip_commission', '500')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('✅ Esquema PostGIS y tablas de Taxi Caldas creadas correctamente');
}
