import { Pool } from 'pg';

const INITIAL_CALDAS_ZONES: Array<{
  name: string;
  zoneType: 'BARRIO' | 'VEREDA' | 'PUNTO_INTERES';
  aliases: string;
  lat: number;
  lng: number;
  surcharge?: number;
}> = [
  // BARRIOS URBANOS DE CALDAS, ANTIOQUIA
  { name: 'Zona Centro', zoneType: 'BARRIO', aliases: 'Parque Principal, Parque de Caldas, Centro Caldas, Parque Principal de Caldas', lat: 6.0910, lng: -75.6357 },
  { name: 'La Rivera', zoneType: 'BARRIO', aliases: 'Barrio La Rivera, La Acuarela, La Acuarela y La Rivera, Acuarela del Rio', lat: 6.0856, lng: -75.6328 },
  { name: 'Andalucía', zoneType: 'BARRIO', aliases: 'Barrio Andalucia', lat: 6.0935, lng: -75.6372 },
  { name: 'Barrios Unidos', zoneType: 'BARRIO', aliases: 'Unidos', lat: 6.0865, lng: -75.6382 },
  { name: 'Bellavista', zoneType: 'BARRIO', aliases: 'Barrio Bellavista', lat: 6.0968, lng: -75.6352 },
  { name: 'Centenario', zoneType: 'BARRIO', aliases: 'Barrio Centenario', lat: 6.0882, lng: -75.6370 },
  { name: 'Chuscala (Sector Urbano)', zoneType: 'BARRIO', aliases: 'Chuscala Barrio', lat: 6.0842, lng: -75.6395 },
  { name: 'Cristo Rey', zoneType: 'BARRIO', aliases: 'Barrio Cristo Rey', lat: 6.0860, lng: -75.6375 },
  { name: 'El Porvenir', zoneType: 'BARRIO', aliases: 'Porvenir', lat: 6.0955, lng: -75.6345 },
  { name: 'El Socorro', zoneType: 'BARRIO', aliases: 'Socorro', lat: 6.0890, lng: -75.6392 },
  { name: 'Felipe Echavarría No. 1', zoneType: 'BARRIO', aliases: 'Felipe Echavarria 1, Felipe Echavarria', lat: 6.0875, lng: -75.6402 },
  { name: 'Felipe Echavarría No. 2', zoneType: 'BARRIO', aliases: 'Felipe Echavarria 2', lat: 6.0868, lng: -75.6410 },
  { name: 'Fundadores', zoneType: 'BARRIO', aliases: 'Barrio Fundadores', lat: 6.0922, lng: -75.6365 },
  { name: 'Juan XXIII', zoneType: 'BARRIO', aliases: 'Juan 23, Barrio Juan XXIII', lat: 6.0880, lng: -75.6385 },
  { name: 'La Aguacatala (Urbano)', zoneType: 'BARRIO', aliases: 'Barrio La Aguacatala', lat: 6.0975, lng: -75.6340 },
  { name: 'La Almería', zoneType: 'BARRIO', aliases: 'Almeria', lat: 6.0835, lng: -75.6360 },
  { name: 'La Buena Esperanza', zoneType: 'BARRIO', aliases: 'Buena Esperanza', lat: 6.0960, lng: -75.6365 },
  { name: 'La Docena', zoneType: 'BARRIO', aliases: 'Docena', lat: 6.0928, lng: -75.6380 },
  { name: 'La Goretty', zoneType: 'BARRIO', aliases: 'Goretty, La Goreti', lat: 6.0902, lng: -75.6388 },
  { name: 'La Inmaculada', zoneType: 'BARRIO', aliases: 'Inmaculada', lat: 6.0945, lng: -75.6375 },
  { name: 'La Mansión', zoneType: 'BARRIO', aliases: 'Mansion', lat: 6.0850, lng: -75.6355 },
  { name: 'La Planta', zoneType: 'BARRIO', aliases: 'Planta', lat: 6.0900, lng: -75.6335 },
  { name: 'La Playita', zoneType: 'BARRIO', aliases: 'Playita', lat: 6.0895, lng: -75.6342 },
  { name: 'La Salle', zoneType: 'BARRIO', aliases: 'Barrio La Salle', lat: 6.0950, lng: -75.6338 },
  { name: 'Las Margaritas', zoneType: 'BARRIO', aliases: 'Margaritas', lat: 6.0940, lng: -75.6385 },
  { name: 'Locería', zoneType: 'BARRIO', aliases: 'La Loceria, Loceria Colombiana', lat: 6.0994, lng: -75.6331 },
  { name: 'Los Cerezos', zoneType: 'BARRIO', aliases: 'Cerezos', lat: 6.0855, lng: -75.6388 },
  { name: 'Mandalay', zoneType: 'BARRIO', aliases: 'Barrio Mandalay', lat: 6.0862, lng: -75.6362 },
  { name: 'Minuto de Dios', zoneType: 'BARRIO', aliases: 'El Minuto de Dios', lat: 6.0848, lng: -75.6378 },
  { name: 'Olaya Herrera', zoneType: 'BARRIO', aliases: 'Barrio Olaya Herrera, Olaya', lat: 6.0932, lng: -75.6390 },
  { name: 'San Judas', zoneType: 'BARRIO', aliases: 'Barrio San Judas', lat: 6.0905, lng: -75.6348 },
  { name: 'Tres Aguas', zoneType: 'BARRIO', aliases: 'Barrio Tres Aguas', lat: 6.0918, lng: -75.6345 },
  { name: 'Villa Capri', zoneType: 'BARRIO', aliases: 'Barrio Villa Capri', lat: 6.0902, lng: -75.6368 },
  { name: 'La Variante', zoneType: 'PUNTO_INTERES', aliases: 'Variante Caldas, Variante', lat: 6.0962, lng: -75.6388 },
  { name: 'Hospital San Vicente de Paúl', zoneType: 'PUNTO_INTERES', aliases: 'Hospital Caldas, Hospital de Caldas', lat: 6.0885, lng: -75.6341 },

  // VEREDAS RURALES DE CALDAS, ANTIOQUIA
  { name: 'La Miel', zoneType: 'VEREDA', aliases: 'Vereda La Miel, Alto de La Miel', lat: 6.0772, lng: -75.6295 },
  { name: 'Salinas', zoneType: 'VEREDA', aliases: 'Vereda Salinas', lat: 6.0745, lng: -75.6472 },
  { name: 'La Valeria', zoneType: 'VEREDA', aliases: 'Vereda La Valeria, Valeria', lat: 6.0925, lng: -75.6220 },
  { name: 'La Corrala', zoneType: 'VEREDA', aliases: 'Vereda La Corrala, Corrala I, Corrala II, Corrala III', lat: 6.0815, lng: -75.6440 },
  { name: 'La Chuscala', zoneType: 'VEREDA', aliases: 'Vereda La Chuscala', lat: 6.0785, lng: -75.6410 },
  { name: 'La Clara', zoneType: 'VEREDA', aliases: 'Vereda La Clara, Alto de La Clara', lat: 6.0630, lng: -75.6320 },
  { name: 'La Quiebra', zoneType: 'VEREDA', aliases: 'Vereda La Quiebra', lat: 6.0680, lng: -75.6385 },
  { name: 'Potrerillo', zoneType: 'VEREDA', aliases: 'Vereda Potrerillo', lat: 6.0790, lng: -75.6345 },
  { name: 'Primavera', zoneType: 'VEREDA', aliases: 'Vereda Primavera, La Primavera', lat: 6.0760, lng: -75.6365 },
  { name: 'El Cano', zoneType: 'VEREDA', aliases: 'Vereda El Cano', lat: 6.1035, lng: -75.6375 },
  { name: 'La Raya', zoneType: 'VEREDA', aliases: 'Vereda La Raya', lat: 6.1055, lng: -75.6390 },
  { name: 'Aguacatala (Rural)', zoneType: 'VEREDA', aliases: 'Vereda Aguacatala, Vereda La Aguacatala', lat: 6.1015, lng: -75.6285 },
  { name: 'Sinifaná', zoneType: 'VEREDA', aliases: 'Vereda Sinifana, Sinifana', lat: 6.0580, lng: -75.6450 },
  { name: 'Maní del Cardal', zoneType: 'VEREDA', aliases: 'Vereda Mani del Cardal, La Mani del Cardal', lat: 6.0650, lng: -75.6490 },
  { name: 'Cardalito', zoneType: 'VEREDA', aliases: 'Vereda Cardalito', lat: 6.0620, lng: -75.6420 },
  { name: 'La Salada Parte Alta', zoneType: 'VEREDA', aliases: 'Vereda La Salada Alta, La Salada', lat: 6.0695, lng: -75.6520 },
  { name: 'La Salada Parte Baja', zoneType: 'VEREDA', aliases: 'Vereda La Salada Baja', lat: 6.0725, lng: -75.6495 },
  { name: 'El Raizal', zoneType: 'VEREDA', aliases: 'Vereda El Raizal, Raizal', lat: 6.0820, lng: -75.6510 },
  { name: 'Minas', zoneType: 'VEREDA', aliases: 'Vereda Minas, Alto de Minas', lat: 6.0520, lng: -75.6350 },
  { name: 'San Miguel', zoneType: 'VEREDA', aliases: 'Vereda San Miguel, Alto de San Miguel', lat: 6.0650, lng: -75.6180 },
];

export async function ensureDatabaseSchema(db: Pool) {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS postgis;

    CREATE TABLE IF NOT EXISTS caldas_zones (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) UNIQUE NOT NULL,
      zone_type VARCHAR(20) NOT NULL DEFAULT 'BARRIO',
      aliases TEXT DEFAULT '',
      surcharge INTEGER DEFAULT 0,
      parent_zone VARCHAR(120) DEFAULT '',
      entry_note VARCHAR(120) DEFAULT '',
      location GEOGRAPHY(Point, 4326) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE caldas_zones ADD COLUMN IF NOT EXISTS parent_zone VARCHAR(120) DEFAULT '';
    ALTER TABLE caldas_zones ADD COLUMN IF NOT EXISTS entry_note VARCHAR(120) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_caldas_zones_location ON caldas_zones USING GIST (location);

    CREATE TABLE IF NOT EXISTS passengers (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(35) UNIQUE NOT NULL,
      full_name VARCHAR(100),
      push_name VARCHAR(100),
      data_consent BOOLEAN DEFAULT FALSE,
      data_consent_at TIMESTAMP WITH TIME ZONE,
      trips_count INTEGER DEFAULT 0,
      rating_avg NUMERIC(3,2) DEFAULT 5.00,
      rating_count INTEGER DEFAULT 0,
      last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE passengers ADD COLUMN IF NOT EXISTS data_consent BOOLEAN DEFAULT FALSE;
    ALTER TABLE passengers ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE passengers ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 5.00;
    ALTER TABLE passengers ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(35) UNIQUE NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      plate VARCHAR(15) UNIQUE NOT NULL,
      vehicle_model VARCHAR(50),
      status VARCHAR(20) DEFAULT 'OFFLINE',
      location GEOGRAPHY(Point, 4326),
      last_location_at TIMESTAMP WITH TIME ZONE,
      is_verified BOOLEAN DEFAULT FALSE,
      approval_status VARCHAR(20) DEFAULT 'PENDING',
      balance INTEGER DEFAULT 0,
      profile_photo_path TEXT,
      doc_photo_path TEXT,
      data_consent BOOLEAN DEFAULT FALSE,
      data_consent_at TIMESTAMP WITH TIME ZONE,
      rating_avg NUMERIC(3,2) DEFAULT 5.00,
      rating_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE drivers ADD COLUMN IF NOT EXISTS profile_photo_path TEXT;
    ALTER TABLE drivers ADD COLUMN IF NOT EXISTS data_consent BOOLEAN DEFAULT FALSE;
    ALTER TABLE drivers ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMP WITH TIME ZONE;

    CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers USING GIST (location);
    CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);

    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      passenger_phone VARCHAR(35) NOT NULL,
      driver_id INTEGER REFERENCES drivers(id),
      pickup_location GEOGRAPHY(Point, 4326) NOT NULL,
      pickup_address TEXT,
      dropoff_location GEOGRAPHY(Point, 4326),
      dropoff_address TEXT,
      distance_km NUMERIC(6,2),
      duration_minutes INTEGER,
      estimated_fare INTEGER,
      status VARCHAR(20) DEFAULT 'SEARCHING',
      rating INTEGER,
      passenger_comment TEXT,
      driver_rating INTEGER,
      driver_comment TEXT,
      followup_count INTEGER DEFAULT 0,
      last_followup_at TIMESTAMP WITH TIME ZONE,
      cancelled_by VARCHAR(20),
      cancelled_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      accepted_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE
    );

    ALTER TABLE trips ADD COLUMN IF NOT EXISTS dropoff_location GEOGRAPHY(Point, 4326);
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS dropoff_address TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6,2);
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS estimated_fare INTEGER;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS passenger_comment TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_rating INTEGER;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_comment TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMP WITH TIME ZONE;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_trip_per_passenger
    ON trips (passenger_phone)
    WHERE status IN ('SEARCHING', 'ACTIVE');

    CREATE TABLE IF NOT EXISTS chat_logs (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER REFERENCES trips(id),
      sender_role VARCHAR(15) NOT NULL,
      sender_phone VARCHAR(35) NOT NULL,
      receiver_phone VARCHAR(35) NOT NULL,
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
      trigger_phone VARCHAR(35) NOT NULL,
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
      ('trip_commission', '500'),
      ('base_fare', '5900'),
      ('price_per_km', '2400'),
      ('min_fare', '8300'),
      ('driver_invite_message', 'Hola Taxi Caldas, soy taxista y quiero registrar mi vehículo')
    ON CONFLICT (key) DO NOTHING;
  `);

  for (const z of INITIAL_CALDAS_ZONES) {
    await db.query(
      `INSERT INTO caldas_zones (name, zone_type, aliases, surcharge, location)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)
       ON CONFLICT (name) DO NOTHING`,
      [z.name, z.zoneType, z.aliases, z.surcharge || 0, z.lng, z.lat]
    );
  }

  console.log('✅ Esquema PostGIS y base territorial de Barrios y Veredas de Caldas listos');
}
