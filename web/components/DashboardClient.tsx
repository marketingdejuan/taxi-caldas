'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LiveMap from '@/components/LiveMap';
import TaxiCaldasLogo from '@/components/TaxiCaldasLogo';
import {
  Car,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Wallet,
  MapPin,
  Star,
  ExternalLink,
  Clock,
  DollarSign,
  Smartphone,
  QrCode,
  Unlink,
  Save,
  LogOut,
  X,
  AlertTriangle,
  Navigation,
  Users,
  Download,
  Search,
} from 'lucide-react';

interface Stats {
  availableDrivers: number;
  busyDrivers: number;
  pendingApprovals: number;
  activeTrips: number;
  completedToday: number;
  todayRevenue: number;
  totalPassengers: number;
}

interface Driver {
  id: number;
  phone: string;
  full_name: string;
  plate: string;
  vehicle_model: string;
  status: string;
  balance: number;
  approval_status: string;
  is_verified: boolean;
  profile_photo_path: string | null;
  doc_photo_path: string | null;
  data_consent?: boolean;
  data_consent_at?: string | null;
  rating_avg: string;
  rating_count: number;
  lat: number | null;
  lng: number | null;
  last_location_at: string | null;
}

interface Passenger {
  id: number;
  phone: string;
  full_name: string | null;
  push_name: string | null;
  data_consent?: boolean;
  data_consent_at?: string | null;
  trips_count: number;
  last_interaction_at: string;
  created_at: string;
}

interface Trip {
  id: number;
  passenger_phone: string;
  passenger_name: string | null;
  status: string;
  rating: number | null;
  cancelled_by: string | null;
  created_at: string;
  driver_name: string | null;
  driver_plate: string | null;
  driver_phone: string | null;
  lat: number | null;
  lng: number | null;
  message_count: number;
}

interface SosAlert {
  id: number;
  trip_id: number;
  triggered_by: 'PASSENGER' | 'DRIVER';
  trigger_phone: string;
  status: string;
  created_at: string;
  passenger_phone: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  driver_name: string | null;
  driver_plate: string | null;
  driver_phone: string | null;
  vehicle_model: string | null;
  drv_lat: number | null;
  drv_lng: number | null;
}

interface ChatMessage {
  id: number;
  trip_id: number;
  sender_role: 'PASSENGER' | 'DRIVER';
  sender_phone: string;
  receiver_phone: string;
  message_type: string;
  content: string;
  created_at: string;
}

interface WhatsAppStatus {
  instanceName: string;
  state: string;
  connectedPhone: string | null;
  profileName: string | null;
  settings: {
    centralPhone: string;
    adminPhones: string;
    tripCommission: number;
  };
}

export default function DashboardClient() {
  const router = useRouter();
  const [tab, setTab] = useState<
    'MAP' | 'TRIPS' | 'DRIVERS' | 'CLIENTS' | 'WHATSAPP'
  >('MAP');
  const [stats, setStats] = useState<Stats>({
    availableDrivers: 0,
    busyDrivers: 0,
    pendingApprovals: 0,
    activeTrips: 0,
    completedToday: 0,
    todayRevenue: 0,
    totalPassengers: 0,
  });
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [resolvingSosId, setResolvingSosId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);

  const [topupAmounts, setTopupAmounts] = useState<Record<number, string>>({});
  const [bonusAmounts, setBonusAmounts] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waFeedback, setWaFeedback] = useState('');
  const [adminPhonesInput, setAdminPhonesInput] = useState('');
  const [commissionInput, setCommissionInput] = useState('500');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState('');

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const fetchWhatsAppStatus = useCallback(
    async (syncInputs = false) => {
      try {
        const res = await fetch('/api/whatsapp', { cache: 'no-store' });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const data: WhatsAppStatus = await res.json();
        if (data.state) {
          setWaStatus(data);
          if (data.state === 'open') {
            setQrCode(null);
          }
          if (syncInputs && data.settings) {
            setAdminPhonesInput(data.settings.adminPhones);
            setCommissionInput(String(data.settings.tripCommission));
          }
        }
      } catch (err) {
        console.error('Error consultando estado WhatsApp:', err);
      }
    },
    [router]
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.drivers) setDrivers(data.drivers);
      if (data.trips) setTrips(data.trips);
      if (data.sosAlerts) setSosAlerts(data.sosAlerts);
      if (data.passengers) setPassengers(data.passengers);
    } catch (err) {
      console.error('Error refrescando tablero:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
    fetchWhatsAppStatus(true);
    const interval = setInterval(() => {
      fetchData();
      fetchWhatsAppStatus(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchData, fetchWhatsAppStatus]);

  function exportPassengersCsv() {
    const headers = [
      'ID',
      'Nombre Registrado',
      'Perfil WhatsApp',
      'Telefono',
      'Habeas Data (Ley 1581)',
      'Fecha Autorizacion',
      'Servicios Pedidos',
      'Ultimo Contacto',
      'Fecha Registro',
    ];
    const rows = passengers.map((p) => [
      p.id,
      `"${(p.full_name || 'Pendiente').replace(/"/g, '""')}"`,
      `"${(p.push_name || '').replace(/"/g, '""')}"`,
      p.phone,
      p.data_consent ? 'AUTORIZADO' : 'PENDIENTE',
      p.data_consent_at ? new Date(p.data_consent_at).toLocaleString('es-CO') : '',
      p.trips_count,
      new Date(p.last_interaction_at).toLocaleString('es-CO'),
      new Date(p.created_at).toLocaleString('es-CO'),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `clientes-taxi-caldas-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleResolveSos(alertId: number) {
    setResolvingSosId(alertId);
    try {
      const res = await fetch('/api/sos/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      });
      if (res.ok) {
        setSosAlerts((prev) => prev.filter((a) => a.id !== alertId));
        await fetchData();
      }
    } finally {
      setResolvingSosId(null);
    }
  }

  async function handleOpenSosTripChat(alert: SosAlert) {
    setTab('TRIPS');
    const existing = trips.find((t) => t.id === alert.trip_id);
    const targetTrip: Trip = existing || {
      id: alert.trip_id,
      passenger_phone: alert.passenger_phone || '',
      passenger_name: null,
      status: 'ACTIVE',
      rating: null,
      cancelled_by: null,
      created_at: alert.created_at,
      driver_name: alert.driver_name,
      driver_plate: alert.driver_plate,
      driver_phone: alert.driver_phone,
      lat: alert.pickup_lat,
      lng: alert.pickup_lng,
      message_count: 0,
    };
    await openTripChat(targetTrip);
  }

  async function handleLogoutSession() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function handleWhatsAppAction(
    action: 'UNLINK' | 'SWITCH_NUMBER' | 'GET_QR' | 'RESTART'
  ) {
    setWaLoading(true);
    setWaFeedback('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (action === 'UNLINK') {
        setQrCode(null);
        setWaFeedback(
          'Teléfono desvinculado correctamente. Puedes vincular uno nuevo cuando quieras.'
        );
      } else if (action === 'RESTART') {
        setWaFeedback('Sesión sincronizada con Evolution API.');
      } else if (data.qrBase64) {
        setQrCode(data.qrBase64);
      }

      await fetchWhatsAppStatus(true);
    } finally {
      setWaLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setWaLoading(true);
    setSettingsSavedMsg('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SAVE_SETTINGS',
          adminPhones: adminPhonesInput,
          tripCommission: Number(commissionInput),
        }),
      });
      if (res.ok) {
        await fetchWhatsAppStatus(true);
        setSettingsSavedMsg('Configuración guardada y aplicada al instante.');
        setTimeout(() => setSettingsSavedMsg(''), 4000);
      }
    } finally {
      setWaLoading(false);
    }
  }

  async function openTripChat(trip: Trip) {
    setSelectedTrip(trip);
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/trips/messages?tripId=${trip.id}`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } finally {
      setLoadingChat(false);
    }
  }

  async function handleDriverAction(
    driverId: number,
    action: 'APPROVE' | 'REJECT' | 'TOPUP',
    amount?: number
  ) {
    setProcessingId(driverId);
    try {
      const res = await fetch('/api/drivers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, action, amount }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setProcessingId(null);
    }
  }

  const pendingDrivers = drivers.filter((d) => d.approval_status === 'PENDING');
  const approvedDrivers = drivers.filter((d) => d.approval_status === 'APPROVED');
  const isConnected = waStatus?.state === 'open';
  const displayPhone =
    waStatus?.connectedPhone || waStatus?.settings?.centralPhone || '';

  const filteredPassengers = passengers.filter((p) => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.push_name || '').toLowerCase().includes(q) ||
      p.phone.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 md:pb-8">
      {/* Barra Superior */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <TaxiCaldasLogo size="sm" theme="light" />
            <button
              onClick={() => setTab('WHATSAPP')}
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs hover:bg-slate-100"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
              <span className="font-mono font-semibold text-slate-700">
                {displayPhone ? `+${displayPhone}` : 'Sin línea'}
              </span>
            </button>
          </div>

          {/* Navegación Desktop */}
          <nav className="hidden md:flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setTab('MAP')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === 'MAP'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapPin className="h-4 w-4" /> Mapa
            </button>
            <button
              onClick={() => setTab('TRIPS')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === 'TRIPS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="h-4 w-4" /> Viajes
            </button>
            <button
              onClick={() => setTab('CLIENTS')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === 'CLIENTS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-4 w-4" /> Clientes
              {passengers.length > 0 && (
                <span className="ml-0.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                  {passengers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('DRIVERS')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === 'DRIVERS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> Conductores
              {stats.pendingApprovals > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {stats.pendingApprovals}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('WHATSAPP')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === 'WHATSAPP'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-4 w-4" /> Línea WhatsApp
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
            </button>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                fetchData();
                fetchWhatsAppStatus(false);
              }}
              title="Actualizar"
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogoutSession}
              title="Cerrar sesión"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>

        {/* Estado rápido de línea en Mobile */}
        <div className="mt-2 flex sm:hidden items-center justify-between border-t border-slate-100 pt-2 text-xs">
          <span className="text-slate-500">
            Línea:{' '}
            <strong className="font-mono text-slate-800">
              {displayPhone ? `+${displayPhone}` : 'Sin vincular'}
            </strong>
          </span>
          <button
            onClick={() => setTab('WHATSAPP')}
            className="font-bold text-amber-600 underline"
          >
            {isConnected ? 'Desvincular / Cambiar' : 'Vincular QR'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* BANNER ROJO DE EMERGENCIA SOS EN TIEMPO REAL */}
        {sosAlerts.length > 0 && (
          <div className="space-y-3">
            {sosAlerts.map((alert) => {
              const whoLabel =
                alert.triggered_by === 'PASSENGER'
                  ? '👤 PASAJERO'
                  : '🚕 CONDUCTOR';
              return (
                <div
                  key={alert.id}
                  className="rounded-2xl border-2 border-red-500 bg-red-600 p-4 sm:p-5 text-white shadow-xl shadow-red-600/20"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-0.5 text-xs font-black uppercase tracking-wide text-red-700 animate-pulse">
                          <AlertTriangle className="h-4 w-4" /> EMERGENCIA SOS #
                          {alert.id}
                        </span>
                        <span className="rounded-full bg-red-800/80 px-2.5 py-0.5 text-xs font-bold">
                          Activada por {whoLabel} ({alert.trigger_phone})
                        </span>
                        <span className="text-xs text-red-100">
                          {new Date(alert.created_at).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-sm sm:text-base font-bold">
                        Servicio #{alert.trip_id} • Vehículo:{' '}
                        <span className="underline">
                          {alert.driver_plate || 'Sin placa'}
                        </span>{' '}
                        ({alert.vehicle_model || 'N/A'})
                      </p>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-red-50">
                        <span>
                          👨‍✈️ Conductor:{' '}
                          <strong>{alert.driver_name || 'N/A'}</strong> (
                          <span className="font-mono">
                            {alert.driver_phone || 'N/A'}
                          </span>
                          )
                        </span>
                        <span>
                          🙋 Pasajero:{' '}
                          <span className="font-mono font-bold">
                            {alert.passenger_phone || 'N/A'}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {alert.pickup_lat != null && alert.pickup_lng != null && (
                        <a
                          href={`https://maps.google.com/?q=${alert.pickup_lat},${alert.pickup_lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-red-800/80 px-3 py-2 text-xs font-bold text-white hover:bg-red-900"
                        >
                          <MapPin className="h-3.5 w-3.5" /> GPS Recogida
                        </a>
                      )}

                      {alert.drv_lat != null && alert.drv_lng != null && (
                        <a
                          href={`https://maps.google.com/?q=${alert.drv_lat},${alert.drv_lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-red-800/80 px-3 py-2 text-xs font-bold text-white hover:bg-red-900"
                        >
                          <Navigation className="h-3.5 w-3.5" /> GPS Taxi
                        </a>
                      )}

                      <button
                        onClick={() => handleOpenSosTripChat(alert)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-950/70 px-3 py-2 text-xs font-bold text-white hover:bg-red-950"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Ver Chat
                      </button>

                      <button
                        disabled={resolvingSosId === alert.id}
                        onClick={() => handleResolveSos(alert.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-black text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {resolvingSosId === alert.id
                          ? 'Cerrando...'
                          : 'Marcar como atendida'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tarjetas KPI */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase">Taxis Libres</span>
              <Car className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-black text-slate-900">
              {stats.availableDrivers}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({stats.busyDrivers} ocup.)
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase">Viajes Activos</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-black text-slate-900">
              {stats.activeTrips}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({stats.completedToday} fin.)
              </span>
            </p>
          </div>

          <div
            onClick={() => setTab('CLIENTS')}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm hover:border-amber-300 transition"
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase">
                Clientes Registrados
              </span>
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-black text-slate-900">
              {passengers.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] font-bold uppercase">Comisiones Hoy</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-1.5 text-xl sm:text-2xl font-black text-emerald-600">
              ${stats.todayRevenue.toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* VISTA 1: MAPA EN VIVO */}
        {tab === 'MAP' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LiveMap drivers={drivers} trips={trips} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col max-h-[480px]">
              <h2 className="text-sm font-bold text-slate-900 mb-3">
                Actividad Reciente ({trips.length})
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {trips.length === 0 && (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    Aún no hay servicios registrados.
                  </p>
                )}
                {trips.slice(0, 12).map((trip) => (
                  <div
                    key={trip.id}
                    onClick={() => openTripChat(trip)}
                    className="cursor-pointer rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:border-amber-300 hover:bg-amber-50/30 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        Servicio #{trip.id}
                      </span>
                      <StatusBadge status={trip.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-700 font-medium">
                      {trip.passenger_name || 'Cliente'}{' '}
                      <span className="font-mono text-slate-500">
                        ({trip.passenger_phone})
                      </span>
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {trip.driver_plate
                          ? `🚕 ${trip.driver_plate} (${trip.driver_name})`
                          : 'Sin asignar'}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-blue-600">
                        <MessageSquare className="h-3 w-3" /> {trip.message_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VISTA 2: VIAJES Y AUDITORÍA DE CHATS */}
        {tab === 'TRIPS' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-4 sm:px-5 py-4">
                <h2 className="font-bold text-slate-900">
                  Historial de Viajes y Trazabilidad
                </h2>
                <p className="text-xs text-slate-500">
                  Toca cualquier servicio para ver el chat enmascarado completo
                </p>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    onClick={() => openTripChat(trip)}
                    className="p-4 active:bg-amber-50/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">Viaje #{trip.id}</span>
                      <StatusBadge status={trip.status} />
                    </div>
                    <div className="text-xs text-slate-700">
                      <strong>{trip.passenger_name || 'Cliente'}</strong> •{' '}
                      <span className="font-mono text-slate-500">
                        {trip.passenger_phone}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-700 font-medium">
                        {trip.driver_plate
                          ? `🚕 ${trip.driver_plate} • ${trip.driver_name}`
                          : 'Sin conductor'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-blue-700">
                        <MessageSquare className="h-3.5 w-3.5" /> {trip.message_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Pasajero</th>
                      <th className="px-4 py-3">Conductor</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Calif.</th>
                      <th className="px-4 py-3">Chat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trips.map((trip) => (
                      <tr
                        key={trip.id}
                        onClick={() => openTripChat(trip)}
                        className={`cursor-pointer hover:bg-slate-50 ${
                          selectedTrip?.id === trip.id ? 'bg-amber-50/60' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold">#{trip.id}</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-slate-900">
                            {trip.passenger_name || 'Sin nombre'}
                          </div>
                          <div className="font-mono text-slate-500">
                            {trip.passenger_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {trip.driver_plate ? (
                            <>
                              <span className="font-bold">{trip.driver_plate}</span>
                              <div className="text-slate-500">
                                {trip.driver_name}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={trip.status} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {trip.rating ? `${trip.rating} ⭐` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            <MessageSquare className="h-3.5 w-3.5" />{' '}
                            {trip.message_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="hidden lg:flex lg:col-span-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex-col h-[560px]">
              <ChatViewer
                trip={selectedTrip}
                messages={chatMessages}
                loading={loadingChat}
              />
            </div>
          </div>
        )}

        {/* VISTA 3: BASE DE DATOS DE CLIENTES / PASAJEROS */}
        {tab === 'CLIENTS' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  Base de Datos de Clientes ({passengers.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Contactos capturados automáticamente por WhatsApp con su nombre y frecuencia de uso
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar por nombre o teléfono..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs focus:border-amber-400 focus:bg-white focus:outline-none"
                  />
                </div>

                <button
                  onClick={exportPassengersCsv}
                  disabled={passengers.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" /> Exportar CSV
                </button>
              </div>
            </div>

            {filteredPassengers.length === 0 ? (
              <p className="p-10 text-center text-xs text-slate-500">
                Aún no hay clientes registrados que coincidan con la búsqueda.
              </p>
            ) : (
              <>
                {/* Tarjetas Mobile */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {filteredPassengers.map((p) => (
                    <div key={p.id} className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">
                          {p.full_name || 'Sin nombre confirmado'}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                          {p.trips_count} viajes
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-600">{p.phone}</p>
                      <p className="text-[11px] text-slate-400">
                        Último mensaje:{' '}
                        {new Date(p.last_interaction_at).toLocaleString('es-CO')}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Tabla PC */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-3">ID</th>
                        <th className="px-5 py-3">Nombre del Cliente</th>
                        <th className="px-5 py-3">Teléfono WhatsApp</th>
                        <th className="px-5 py-3">Habeas Data</th>
                        <th className="px-5 py-3">Servicios</th>
                        <th className="px-5 py-3">Última Interacción</th>
                        <th className="px-5 py-3">Registrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPassengers.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3 text-xs text-slate-500">
                            #{p.id}
                          </td>
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-900">
                              {p.full_name || (
                                <span className="font-normal italic text-slate-400">
                                  Pendiente de confirmar
                                </span>
                              )}
                            </div>
                            {p.push_name && (
                              <div className="text-[11px] text-slate-400">
                                Perfil WA: {p.push_name}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-700">
                            {p.phone}
                          </td>
                          <td className="px-5 py-3 text-xs">
                            {p.data_consent ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
                                ✓ Ley 1581
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-600">
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                              {p.trips_count}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-600">
                            {new Date(p.last_interaction_at).toLocaleString('es-CO')}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            {new Date(p.created_at).toLocaleDateString('es-CO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* VISTA 4: APROBACIONES Y CONDUCTORES */}
        {tab === 'DRIVERS' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <h2 className="font-bold text-slate-900 mb-1">
                Solicitudes Pendientes ({pendingDrivers.length})
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Verifica el documento adjunto, asigna bono inicial y aprueba para activar al conductor.
              </p>

              {pendingDrivers.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">
                  No hay conductores pendientes por revisar en este momento.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {pendingDrivers.map((drv) => (
                    <div
                      key={drv.id}
                      className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block rounded-md bg-amber-400 px-2 py-0.5 text-xs font-extrabold text-slate-950">
                            {drv.plate}
                          </span>
                          <h3 className="mt-1 font-bold text-slate-900">
                            {drv.full_name}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {drv.vehicle_model}
                          </p>
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            WhatsApp: {drv.phone}
                          </p>
                        </div>

                        {drv.profile_photo_path && (
                          <a
                            href={`${backendUrl}/${drv.profile_photo_path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-amber-100/70 px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 mr-1.5"
                          >
                            Foto Perfil <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {drv.doc_photo_path && (
                          <a
                            href={`${backendUrl}/${drv.doc_photo_path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Documento <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/60">
                        <input
                          type="number"
                          placeholder="Bono COP"
                          value={bonusAmounts[drv.id] ?? '5000'}
                          onChange={(e) =>
                            setBonusAmounts({
                              ...bonusAmounts,
                              [drv.id]: e.target.value,
                            })
                          }
                          className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <button
                          disabled={processingId === drv.id}
                          onClick={() =>
                            handleDriverAction(
                              drv.id,
                              'APPROVE',
                              Number(bonusAmounts[drv.id] ?? 5000)
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                        </button>
                        <button
                          disabled={processingId === drv.id}
                          onClick={() => handleDriverAction(drv.id, 'REJECT')}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-4 sm:px-5 py-4">
                <h2 className="font-bold text-slate-900">
                  Base de Datos de Conductores y Billeteras ({approvedDrivers.length})
                </h2>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {approvedDrivers.map((drv) => (
                  <div key={drv.id} className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-black text-sm mr-2">{drv.plate}</span>
                        <StatusBadge status={drv.status} />
                      </div>
                      <span className="font-bold text-sm text-emerald-700">
                        ${Number(drv.balance).toLocaleString('es-CO')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {drv.full_name} • {drv.vehicle_model} • ⭐{' '}
                      {drv.rating_avg || '5.00'}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        placeholder="Monto recarga"
                        value={topupAmounts[drv.id] || ''}
                        onChange={(e) =>
                          setTopupAmounts({
                            ...topupAmounts,
                            [drv.id]: e.target.value,
                          })
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                      <button
                        disabled={processingId === drv.id || !topupAmounts[drv.id]}
                        onClick={() => {
                          handleDriverAction(
                            drv.id,
                            'TOPUP',
                            Number(topupAmounts[drv.id])
                          );
                          setTopupAmounts({ ...topupAmounts, [drv.id]: '' });
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        <Wallet className="h-3.5 w-3.5" /> Recargar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Placa</th>
                      <th className="px-4 py-3">Conductor</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Calificación</th>
                      <th className="px-4 py-3">Saldo</th>
                      <th className="px-4 py-3">Recarga Rápida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvedDrivers.map((drv) => (
                      <tr key={drv.id}>
                        <td className="px-4 py-3 font-bold">{drv.plate}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {drv.full_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {drv.vehicle_model} • {drv.phone}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={drv.status} />
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {drv.rating_avg || '5.00'} ({drv.rating_count || 0})
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          ${Number(drv.balance).toLocaleString('es-CO')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              placeholder="20000"
                              value={topupAmounts[drv.id] || ''}
                              onChange={(e) =>
                                setTopupAmounts({
                                  ...topupAmounts,
                                  [drv.id]: e.target.value,
                                })
                              }
                              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                            />
                            <button
                              disabled={
                                processingId === drv.id || !topupAmounts[drv.id]
                              }
                              onClick={() => {
                                handleDriverAction(
                                  drv.id,
                                  'TOPUP',
                                  Number(topupAmounts[drv.id])
                                );
                                setTopupAmounts({ ...topupAmounts, [drv.id]: '' });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                            >
                              <Wallet className="h-3 w-3" /> Recargar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA 5: DESVINCULAR / CAMBIAR LÍNEA WHATSAPP */}
        {tab === 'WHATSAPP' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Gestión de Teléfono WhatsApp
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Desliga el número actual o vincula uno nuevo para tus pruebas con clientes
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    isConnected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {isConnected
                    ? '🟢 Conectado'
                    : waStatus?.state === 'connecting'
                    ? '🟡 Sincronizando...'
                    : '🔴 Desligado'}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1">
                <p className="text-xs text-slate-500">
                  Número conectado actualmente:
                </p>
                <p className="text-xl font-mono font-bold text-slate-900">
                  {waStatus?.connectedPhone
                    ? `+${waStatus.connectedPhone}`
                    : 'Ningún teléfono vinculado'}
                </p>
                {waStatus?.profileName && (
                  <p className="text-xs text-slate-600">
                    Perfil:{' '}
                    <span className="font-semibold">{waStatus.profileName}</span>
                  </p>
                )}
              </div>

              {waFeedback && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                  ✅ {waFeedback}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  disabled={waLoading}
                  onClick={() => handleWhatsAppAction('RESTART')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${waLoading ? 'animate-spin' : ''}`}
                  />
                  Sincronizar sesión
                </button>

                {isConnected && (
                  <button
                    disabled={waLoading}
                    onClick={() => handleWhatsAppAction('UNLINK')}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <Unlink className="h-4 w-4" />
                    {waLoading ? 'Desligando...' : 'Desligar teléfono'}
                  </button>
                )}

                <button
                  disabled={waLoading}
                  onClick={() => handleWhatsAppAction('SWITCH_NUMBER')}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
                >
                  <QrCode className="h-4 w-4" />
                  {waLoading
                    ? 'Generando QR...'
                    : isConnected
                    ? 'Cambiar por otro número (QR)'
                    : 'Vincular nuevo teléfono (QR)'}
                </button>
              </div>

              {qrCode && (
                <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/30 p-5 text-center space-y-3">
                  <p className="text-sm font-bold text-slate-900">
                    Escanea este QR con el celular de prueba
                  </p>
                  <div className="mx-auto w-56 h-56 bg-white p-3 rounded-xl shadow-sm flex items-center justify-center">
                    <img
                      src={qrCode}
                      alt="Código QR WhatsApp"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto">
                    Abre{' '}
                    <strong>
                      WhatsApp → Dispositivos vinculados → Vincular un dispositivo
                    </strong>
                    . Al escanearlo, Taxi Caldas quedará activo en esa línea.
                  </p>
                </div>
              )}
            </div>

            <form
              onSubmit={handleSaveSettings}
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Parámetros de Taxi Caldas
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Teléfonos autorizados para comandos (/aprobar, /recargar) y tarifa de comisión
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfonos Administrador (con 57, separados por coma)
                  </label>
                  <input
                    type="text"
                    value={adminPhonesInput}
                    onChange={(e) => setAdminPhonesInput(e.target.value)}
                    placeholder="573133336835, 573001234567"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Comisión por servicio aceptado (COP)
                  </label>
                  <input
                    type="number"
                    value={commissionInput}
                    onChange={(e) => setCommissionInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono"
                  />
                </div>
              </div>

              {settingsSavedMsg && (
                <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                  ✅ {settingsSavedMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={waLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> Guardar Parámetros
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Modal de Chat en Mobile / Tablet */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4 lg:hidden">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl flex flex-col h-[82vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-xs font-bold text-slate-900">
                Chat Servicio #{selectedTrip.id}
              </span>
              <button
                onClick={() => setSelectedTrip(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <ChatViewer
                trip={selectedTrip}
                messages={chatMessages}
                loading={loadingChat}
              />
            </div>
          </div>
        </div>
      )}

      {/* Barra de Navegación Inferior Táctil para Celulares */}
      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur py-1.5 md:hidden">
        <button
          onClick={() => setTab('MAP')}
          className={`flex flex-col items-center justify-center py-1 text-[10px] font-bold ${
            tab === 'MAP' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <MapPin className="h-5 w-5 mb-0.5" />
          Mapa
        </button>
        <button
          onClick={() => setTab('TRIPS')}
          className={`flex flex-col items-center justify-center py-1 text-[10px] font-bold ${
            tab === 'TRIPS' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <MessageSquare className="h-5 w-5 mb-0.5" />
          Viajes
        </button>
        <button
          onClick={() => setTab('CLIENTS')}
          className={`flex flex-col items-center justify-center py-1 text-[10px] font-bold ${
            tab === 'CLIENTS' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <Users className="h-5 w-5 mb-0.5" />
          Clientes
        </button>
        <button
          onClick={() => setTab('DRIVERS')}
          className={`relative flex flex-col items-center justify-center py-1 text-[10px] font-bold ${
            tab === 'DRIVERS' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <ShieldCheck className="h-5 w-5 mb-0.5" />
          Flota
          {stats.pendingApprovals > 0 && (
            <span className="absolute top-0.5 right-3 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
              {stats.pendingApprovals}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('WHATSAPP')}
          className={`relative flex flex-col items-center justify-center py-1 text-[10px] font-bold ${
            tab === 'WHATSAPP' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <Smartphone className="h-5 w-5 mb-0.5" />
          Línea
          <span
            className={`absolute top-1 right-4 h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
        </button>
      </nav>
    </div>
  );
}

function ChatViewer({
  trip,
  messages,
  loading,
}: {
  trip: Trip | null;
  messages: ChatMessage[];
  loading: boolean;
}) {
  return (
    <>
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="font-bold text-sm text-slate-900">
          {trip
            ? `Auditoría Chat • Servicio #${trip.id}`
            : 'Selecciona un viaje'}
        </h3>
        {trip && (
          <p className="text-[11px] text-slate-500 mt-0.5">
            {trip.passenger_name || 'Pasajero'} ({trip.passenger_phone}) ↔ Taxi{' '}
            {trip.driver_plate || 'N/A'}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
        {!trip && (
          <p className="text-center text-xs text-slate-400 mt-20">
            Haz clic en un servicio para ver los mensajes intercambiados.
          </p>
        )}
        {trip && loading && (
          <p className="text-center text-xs text-slate-500 mt-10">
            Cargando conversación...
          </p>
        )}
        {trip && !loading && messages.length === 0 && (
          <p className="text-center text-xs text-slate-400 mt-10">
            No hubo mensajes registrados en este viaje.
          </p>
        )}
        {messages.map((m) => {
          const isPassenger = m.sender_role === 'PASSENGER';
          const isSos = m.message_type === 'SOS';
          return (
            <div
              key={m.id}
              className={`flex flex-col max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                isSos
                  ? 'self-center mx-auto bg-red-600 text-white border border-red-700 font-bold'
                  : isPassenger
                  ? 'self-start bg-white border border-slate-200 text-slate-800'
                  : 'self-end ml-auto bg-amber-100 border border-amber-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-bold">
                  {isSos
                    ? '🆘 ALERTA SOS'
                    : isPassenger
                    ? '👤 Pasajero'
                    : '🚕 Conductor'}
                </span>
                <span
                  className={`text-[10px] ${
                    isSos ? 'text-red-100' : 'text-slate-500'
                  }`}
                >
                  {new Date(m.created_at).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    AVAILABLE: 'bg-emerald-100 text-emerald-800',
    BUSY: 'bg-amber-100 text-amber-800',
    OFFLINE: 'bg-slate-200 text-slate-700',
    SEARCHING: 'bg-blue-100 text-blue-800',
    ACTIVE: 'bg-amber-100 text-amber-800',
    COMPLETED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  const labels: Record<string, string> = {
    AVAILABLE: 'Disponible',
    BUSY: 'En carrera',
    OFFLINE: 'Desconectado',
    SEARCHING: 'Buscando taxi',
    ACTIVE: 'En curso',
    COMPLETED: 'Completado',
    CANCELLED: 'Cancelado',
  };

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        styles[status] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
