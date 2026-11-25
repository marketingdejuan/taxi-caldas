import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const api = axios.create({
  baseURL: process.env.EVOLUTION_URL,
  headers: {
    apikey: process.env.EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
});

const instance = process.env.INSTANCE_NAME;

export async function sendText(to: string, text: string) {
  await api.post(`/message/sendText/${instance}`, {
    number: to,
    text,
    delay: 800,
  });
}

export async function sendLocation(to: string, lat: number, lng: number, name: string) {
  await api.post(`/message/sendLocation/${instance}`, {
    number: to,
    name,
    address: 'Punto de recogida del pasajero',
    latitude: lat,
    longitude: lng,
  });
}

export async function getMediaBase64(messageData: any): Promise<{ base64: string; mimetype: string }> {
  const res = await api.post(`/chat/getBase64FromMediaMessage/${instance}`, {
    message: {
      key: messageData.key,
      message: messageData.message,
    },
    convertToMp4: false,
  });

  const rawBase64: string = res.data?.base64 || '';
  const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '');

  return {
    base64: cleanBase64,
    mimetype: res.data?.mimetype || '',
  };
}

export async function sendMedia(
  to: string,
  mediatype: 'image' | 'video',
  base64: string,
  mimetype: string,
  caption: string
) {
  await api.post(`/message/sendMedia/${instance}`, {
    number: to,
    mediatype,
    mimetype,
    caption,
    media: base64,
    fileName: mediatype === 'image' ? 'imagen.jpg' : 'video.mp4',
  });
}

export async function sendAudio(to: string, base64: string) {
  await api.post(`/message/sendWhatsAppAudio/${instance}`, {
    number: to,
    audio: base64,
    delay: 600,
  });
}
