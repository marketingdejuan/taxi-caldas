'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TaxiCaldasLogo from '@/components/TaxiCaldasLogo';
import { Lock, User, Eye, EyeOff, Smartphone } from 'lucide-react';

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
        setError(data.error || 'Credenciales inválidas');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <TaxiCaldasLogo size="lg" darkText={false} />
          <p className="mt-3 text-xs text-slate-400">
            Ingresa tus credenciales administrativas para gestionar flota, líneas WhatsApp y despachos.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl space-y-5"
        >
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Usuario
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type={showPass ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-300">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-black text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 transition disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Entrar a Taxi Caldas'}
          </button>
        </form>

        {/* Guía rápida de acceso directo móvil */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <Smartphone className="h-4 w-4 text-amber-400" />
            Instalar como App en tu celular:
          </div>
          <p>
            • <strong className="text-slate-300">iPhone (Safari):</strong> Toca{' '}
            <span className="text-amber-300">Compartir</span> →{' '}
            <span className="text-amber-300">Agregar a inicio</span>.
          </p>
          <p>
            • <strong className="text-slate-300">Android (Chrome):</strong> Toca el menú{' '}
            <span className="text-amber-300">⋮</span> →{' '}
            <span className="text-amber-300">Agregar a pantalla principal</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
