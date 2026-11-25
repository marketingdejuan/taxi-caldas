'use client';

import { useState } from 'react';
import TaxiCaldasLogo from '@/components/TaxiCaldasLogo';
import {
  Car,
  CheckCircle2,
  Camera,
  FileText,
  ShieldCheck,
  User,
  Phone,
  Hash,
} from 'lucide-react';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PublicDriverRegisterPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [docPhoto, setDocPhoto] = useState<string | null>(null);
  const [dataConsent, setDataConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handlePhotoChange(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string | null) => void
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    setter(b64);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!dataConsent) {
      setError('Debes aceptar la autorización de tratamiento de datos (Ley 1581).');
      return;
    }
    if (!profilePhoto || !docPhoto) {
      setError('Adjunta tanto tu foto selfie de perfil como la foto de tus documentos.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/public/driver-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          plate,
          vehicleModel,
          profilePhotoBase64: profilePhoto,
          docPhotoBase64: docPhoto,
          dataConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo completar el registro.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <TaxiCaldasLogo size="md" theme="dark" />
          <h1 className="text-2xl font-extrabold text-white pt-2">
            Afiliación de Conductores
          </h1>
          <p className="text-xs text-slate-400 max-w-sm">
            Completa tu perfil para recibir solicitudes de pasajeros directamente en tu WhatsApp.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-slate-900 p-7 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-white">
              ¡Registro enviado con éxito!
            </h2>
            <p className="text-xs leading-relaxed text-slate-300">
              Hola <strong>{fullName}</strong>, ya guardamos tu perfil para el vehículo{' '}
              <strong className="text-amber-400">{plate.toUpperCase()}</strong>. Revisaremos tu foto y documentos y te notificaremos por WhatsApp en cuanto tu cuenta quede activa.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre y Apellido
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Carlos Andrés Gómez"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Número de WhatsApp
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 3001234567"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white font-mono focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Placa del Taxi
                </label>
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="WXY-123"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white font-mono uppercase focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Vehículo y Color
                </label>
                <div className="relative">
                  <Car className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="Kia Picanto Amarillo"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="cursor-pointer rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-3.5 text-center hover:border-amber-400 transition">
                <Camera className="mx-auto h-5 w-5 text-amber-400 mb-1" />
                <span className="block text-xs font-bold text-slate-200">
                  {profilePhoto ? '✅ Foto de perfil lista' : 'Foto selfie de perfil'}
                </span>
                <span className="block text-[10px] text-slate-400 mt-0.5">
                  La verá el pasajero al asignar
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) => handlePhotoChange(e, setProfilePhoto)}
                  className="hidden"
                />
              </label>

              <label className="cursor-pointer rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-3.5 text-center hover:border-amber-400 transition">
                <FileText className="mx-auto h-5 w-5 text-amber-400 mb-1" />
                <span className="block text-xs font-bold text-slate-200">
                  {docPhoto ? '✅ Documento listo' : 'Foto Tarjetón / Licencia'}
                </span>
                <span className="block text-[10px] text-slate-400 mt-0.5">
                  Para validar tu vehículo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoChange(e, setDocPhoto)}
                  className="hidden"
                />
              </label>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={dataConsent}
                onChange={(e) => setDataConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 accent-amber-400"
              />
              <span>
                <strong className="text-white inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Autorización Habeas Data (Ley 1581 de 2012):
                </strong>{' '}
                Autorizo a Taxi Caldas el tratamiento de mis datos personales, fotografías y ubicación GPS para gestionar servicios de transporte y seguridad.
              </span>
            </label>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300 transition disabled:opacity-50"
            >
              {loading ? 'Enviando registro...' : 'Enviar Solicitud de Registro'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
