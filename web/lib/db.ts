import { Pool } from 'pg';

const globalForPg = global as unknown as { pool: Pool };

export const db =
  globalForPg.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') globalForPg.pool = db;

export async function sendWhatsAppNotification(to: string, text: string) {
  try {
    await fetch(
      `${process.env.EVOLUTION_URL}/message/sendText/${process.env.INSTANCE_NAME}`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.EVOLUTION_API_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: to,
          text,
          delay: 600,
        }),
      }
    );
  } catch (error) {
    console.error('Error enviando notificación WhatsApp:', error);
  }
}
