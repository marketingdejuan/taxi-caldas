'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TaxiCaldasLogo from '@/components/TaxiCaldasLogo';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  MapPin,
  Smartphone,
  ArrowRight,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Usuario o contraseña incorrectos');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:grid lg:grid-cols-12">
      {/* Columna Izquierda: Presentación de Marca (Visible en Desktop) */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 relative flex-col justify-between overflow-hidden bg-slate-900 p-12 border-r border-slate-800/80">
        {/* Resplandor sutil ambiental */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-500/5 blur-3xl" />

        <div className="relative z-10">
          <TaxiCaldasLogo size="md" theme="dark" />
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Sistema de Despacho Automatizado 24/7
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
            Gestión inteligente de flota y carreras por{' '}
            <span className="text-amber-400">WhatsApp</span>.
          </h1>

          <p className="text-sm leading-relaxed text-slate-400">
            Monitorea taxis en tiempo real, audita conversaciones enmascaradas,
            gestiona recargas prepago y atiende alertas SOS desde un solo lugar.
          </p>

          <div className="grid grid-cols-1 gap-3 pt-2">
            <div className="flex items-center gap-3.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">
                  Despacho Georreferenciado PostGIS
                </p>
                <p className="text-[11px] text-slate-400">
                  Asignación por cercanía (2.5 km a 5 km) en segundos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">
                  Privacidad de Números y Protocolo SOS
                </p>
                <p className="text-[11px] text-slate-400">
                  Chat puente enmascarado con respaldo multimedia y alertas silenciosas.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Taxi Caldas</span>
          <span>Plataforma Operativa</span>
        </div>
      </div>

      {/* Columna Derecha: Formulario de Acceso */}
      <div className="flex-1 lg:col-span-6 xl:col-span-5 flex flex-col items-center justify-center px-5 py-10 sm:px-10 bg-slate-950">
        <div className="w-full max-w-sm space-y-7">
          {/* Logo visible en móvil y tablet */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="lg:hidden mb-5">
              <TaxiCaldasLogo size="md" theme="dark" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Iniciar sesión
            </h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Ingresa tus credenciales para acceder al panel de despacho.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-6 shadow-xl backdrop-blur space-y-5"
          >
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Usuario
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ingresa tu usuario"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 transition focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  aria-label="Mostrar contraseña"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                >
                  {showPass ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-400/15 hover:bg-amber-300 active:scale-[0.99] transition disabled:opacity-50"
            >
              <span>{loading ? 'Verificando...' : 'Ingresar al Panel'}</span>
              {!loading && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </form>

          {/* Nota compacta para instalar como App móvil */}
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3.5 py-3 text-[11px] leading-relaxed text-slate-400">
            <Smartphone className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <p>
              <strong className="text-slate-300">Acceso rápido móvil:</strong>{' '}
              en iPhone toca <span className="text-slate-200">Compartir → Agregar a inicio</span>; en Android toca{' '}
              <span className="text-slate-200">⋮ → Instalar aplicación</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
