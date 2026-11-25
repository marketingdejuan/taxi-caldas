'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LiveMap from '@/components/LiveMap';
import ZoneMapPicker, { CaldasZoneItem } from '@/components/ZoneMapPicker';
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
  Trash2,
  Copy,
  Link2,
  Send,
  Compass,
  Pencil,
  Plus,
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
  dropoff_address: string | null;
  distance_km: string | number | null;
  estimated_fare: number | null;
  status: string;
  rating: number | null;
  passenger_comment: string | null;
  driver_rating: number | null;
  driver_comment: string | null;
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
  sender_role: 'PASSENGER' | 'DRIVER' | 'CENTRAL';
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
    baseFare?: number;
    pricePerKm?: number;
    minFare?: number;
    driverInviteMessage?: string;
  };
}

export default function DashboardClient() {
  const router = useRouter();
  const [tab, setTab] = useState<
    'MAP' | 'TRIPS' | 'ZONES' | 'DRIVERS' | 'CLIENTS' | 'WHATSAPP'
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
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waFeedback, setWaFeedback] = useState('');
  const [adminPhonesInput, setAdminPhonesInput] = useState('');
  const [commissionInput, setCommissionInput] = useState('500');
  const [baseFareInput, setBaseFareInput] = useState('5900');
  const [pricePerKmInput, setPricePerKmInput] = useState('2400');
  const [minFareInput, setMinFareInput] = useState('8300');
  const [inviteMsgInput, setInviteMsgInput] = useState(
    'Hola Taxi Caldas, soy taxista y quiero registrar mi vehículo'
  );
  const [copiedLabel, setCopiedLabel] = useState('');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState('');

  const [zones, setZones] = useState<CaldasZoneItem[]>([]);
  const [zoneSearch, setZoneSearch] = useState('');
  const [zoneTypeFilter, setZoneTypeFilter] = useState<'ALL' | 'BARRIO' | 'VEREDA'>('ALL');
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [zoneNameInput, setZoneNameInput] = useState('');
  const [zoneTypeInput, setZoneTypeInput] = useState<'BARRIO' | 'VEREDA' | 'PUNTO_INTERES'>('BARRIO');
  const [zoneAliasesInput, setZoneAliasesInput] = useState('');
  const [zoneSurchargeInput, setZoneSurchargeInput] = useState('0');
  const [zoneLatInput, setZoneLatInput] = useState<number>(6.0856);
  const [zoneLngInput, setZoneLngInput] = useState<number>(-75.6328);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneFeedback, setZoneFeedback] = useState('');

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
            if (data.settings.baseFare !== undefined) {
              setBaseFareInput(String(data.settings.baseFare));
            }
            if (data.settings.pricePerKm !== undefined) {
              setPricePerKmInput(String(data.settings.pricePerKm));
            }
            if (data.settings.minFare !== undefined) {
              setMinFareInput(String(data.settings.minFare));
            }
            if (data.settings.driverInviteMessage) {
              setInviteMsgInput(data.settings.driverInviteMessage);
            }
          }
        }
      } catch (err) {
        console.error('Error consultando estado WhatsApp:', err);
      }
    },
    [router]
  );

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/zones', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.zones) setZones(data.zones);
      }
    } catch (err) {
      console.error('Error cargando barrios y veredas:', err);
    }
  }, []);

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
    fetchZones();
    fetchWhatsAppStatus(true);
    const interval = setInterval(() => {
      fetchData();
      fetchWhatsAppStatus(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchData, fetchWhatsAppStatus]);

  function startNewZone() {
    setEditingZoneId(null);
    setZoneNameInput('');
    setZoneTypeInput('BARRIO');
    setZoneAliasesInput('');
    setZoneSurchargeInput('0');
    setZoneLatInput(6.091);
    setZoneLngInput(-75.6357);
    setZoneFeedback('');
  }

  function startEditZone(z: CaldasZoneItem) {
    setEditingZoneId(z.id);
    setZoneNameInput(z.name);
    setZoneTypeInput(z.zone_type);
    setZoneAliasesInput(z.aliases || '');
    setZoneSurchargeInput(String(z.surcharge || 0));
    setZoneLatInput(Number(z.lat));
    setZoneLngInput(Number(z.lng));
    setZoneFeedback('');
  }

  async function handleSaveZone(e: React.FormEvent) {
    e.preventDefault();
    if (!zoneNameInput.trim()) return;
    setZoneSaving(true);
    setZoneFeedback('');
    try {
      const res = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingZoneId ? 'UPDATE' : 'CREATE',
          id: editingZoneId,
          name: zoneNameInput.trim(),
          zoneType: zoneTypeInput,
          aliases: zoneAliasesInput.trim(),
          surcharge: Number(zoneSurchargeInput || 0),
          lat: zoneLatInput,
          lng: zoneLngInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setZoneFeedback(`❌ ${data.error || 'No se pudo guardar'}`);
        return;
      }
      await fetchZones();
      setZoneFeedback(
        editingZoneId
          ? '✅ Barrio/Vereda actualizado y aplicado al cotizador.'
          : '✅ Nuevo Barrio/Vereda creado y activo en el cotizador.'
      );
      if (!editingZoneId) {
        startNewZone();
      }
    } finally {
      setZoneSaving(false);
    }
  }

  async function handleDeleteZone(z: CaldasZoneItem) {
    if (!window.confirm(`¿Eliminar "${z.name}" de la base territorial?`)) return;
    const res = await fetch('/api/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DELETE', id: z.id }),
    });
    if (res.ok) {
      if (editingZoneId === z.id) startNewZone();
      await fetchZones();
    }
  }

  function copyText(value: string, label: string) {
    navigator.clipboard.writeText(value);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(''), 2500);
  }

  async function handleDeleteProfile(
    type: 'DRIVER' | 'PASSENGER',
    id: number,
    label: string
  ) {
    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar el perfil de ${label}? Esta acción liberará el número para volver a registrarlo desde cero.`
    );
    if (!confirmed) return;

    const key = `${type}-${id}`;
    setDeletingKey(key);
    try {
      const res = await fetch('/api/profiles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setDeletingKey(null);
    }
  }

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
      p.data_consent_at
        ? new Date(p.data_consent_at).toLocaleString('es-CO')
        : '',
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
      dropoff_address: null,
      distance_km: null,
      estimated_fare: null,
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

  async function handleSaveSettings(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
          baseFare: Number(baseFareInput),
          pricePerKm: Number(pricePerKmInput),
          minFare: Number(minFareInput),
          driverInviteMessage: inviteMsgInput,
        }),
      });
      if (res.ok) {
        await fetchWhatsAppStatus(true);
        setSettingsSavedMsg('Tarifas y parámetros guardados y aplicados al instante.');
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

  async function handleSendCentralMessage(
    tripId: number,
    target: 'BOTH' | 'PASSENGER' | 'DRIVER',
    message: string
  ) {
    const res = await fetch('/api/trips/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, target, message }),
    });
    if (res.ok && selectedTrip) {
      await openTripChat(selectedTrip);
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

  const siteOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://taxicaldas.ikiero.com';
  const webDriverRegisterLink = `${siteOrigin}/registro-taxista`;
  const waDriverInviteLink = displayPhone
    ? `https://wa.me/${displayPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        inviteMsgInput
      )}`
    : '';

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
          <div className="flex items-center gap-2.5">
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
            {waDriverInviteLink && (
              <button
                onClick={() => copyText(waDriverInviteLink, 'HEADER_WA')}
                title="Copiar link de WhatsApp para registro de taxistas"
                className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
              >
                <Link2 className="h-3.5 w-3.5 text-amber-600" />
                {copiedLabel === 'HEADER_WA'
                  ? '¡Link WA copiado!'
                  : 'Link Registro Taxista'}
              </button>
            )}
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
              onClick={() => setTab('ZONES')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === 'ZONES'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Compass className="h-4 w-4" /> Barrios / Veredas
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
              <Smartphone className="h-4 w-4" /> Línea y Tarifas
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
            {isConnected ? 'Tarifas / Links' : 'Vincular QR'}
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
                  ? '👤 USUARIO'
                  : '🚕 TAXISTA';
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
                          👨‍✈️ Taxista:{' '}
                          <strong>{alert.driver_name || 'N/A'}</strong> (
                          <span className="font-mono">
                            {alert.driver_phone || 'N/A'}
                          </span>
                          )
                        </span>
                        <span>
                          🙋 Usuario:{' '}
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col max-h-[520px]">
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
                      {trip.passenger_name || 'Usuario'}{' '}
                      <span className="font-mono text-slate-500">
                        ({trip.passenger_phone})
                      </span>
                    </p>
                    {(trip.rating || trip.driver_rating || trip.passenger_comment || trip.driver_comment) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-slate-800 space-y-0.5">
                {trip.rating && (
                  <p>
                    <strong>👤 Usuario calificó ({trip.rating}⭐):</strong>{" "}
                    {trip.passenger_comment || "Sin comentario adicional"}
                  </p>
                )}
                {trip.driver_rating && (
                  <p>
                    <strong>🚕 Taxista calificó ({trip.driver_rating}⭐):</strong>{" "}
                    {trip.driver_comment || "Sin comentario adicional"}
                  </p>
                )}
              </div>
            )}
            {trip.dropoff_address && (
                      <p className="mt-0.5 text-[11px] text-slate-600 truncate">
                        🏁 {trip.dropoff_address} •{' '}
                        <strong className="text-emerald-700">
                          {trip.estimated_fare
                            ? `$${Number(trip.estimated_fare).toLocaleString('es-CO')}`
                            : ''}
                        </strong>
                      </p>
                    )}
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
                  Historial de Viajes, Cotizaciones y Trazabilidad
                </h2>
                <p className="text-xs text-slate-500">
                  Toca cualquier servicio para ver el chat enmascarado o escribir como Central Taxi Caldas
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
                      <strong>{trip.passenger_name || 'Usuario'}</strong> •{' '}
                      <span className="font-mono text-slate-500">
                        {trip.passenger_phone}
                      </span>
                    </div>
                    {trip.dropoff_address && (
                      <div className="text-xs text-slate-600">
                        🏁 {trip.dropoff_address} ({trip.distance_km} km) •{' '}
                        <strong className="text-emerald-700">
                          ${Number(trip.estimated_fare || 0).toLocaleString('es-CO')}
                        </strong>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-700 font-medium">
                        {trip.driver_plate
                          ? `🚕 ${trip.driver_plate} • ${trip.driver_name}`
                          : 'Sin taxista'}
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
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Destino / Tarifa</th>
                      <th className="px-4 py-3">Taxista</th>
                      <th className="px-4 py-3">Calif. / Reseñas</th>
                      <th className="px-4 py-3">Estado</th>
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
                          {trip.dropoff_address ? (
                            <>
                              <div className="font-medium text-slate-800 max-w-[170px] truncate">
                                {trip.dropoff_address}
                              </div>
                              <div className="font-bold text-emerald-700">
                                ${Number(trip.estimated_fare || 0).toLocaleString('es-CO')}{' '}
                                <span className="font-normal text-slate-500">
                                  ({trip.distance_km} km)
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">Directo (sin B)</span>
                          )}
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
                        <td className="px-4 py-3 text-xs space-y-0.5">
                          <div>
                            {trip.rating ? (
                              <span className="font-semibold text-slate-800">
                                👤→🚕 {trip.rating}⭐
                              </span>
                            ) : (
                              <span className="text-slate-400">👤→🚕 —</span>
                            )}
                            {trip.driver_rating && (
                              <span className="ml-2 font-semibold text-amber-800">
                                🚕→👤 {trip.driver_rating}⭐
                              </span>
                            )}
                          </div>
                          {trip.passenger_comment && (
                            <p className="text-[11px] text-slate-500 max-w-[160px] truncate" title={trip.passenger_comment}>
                              "{trip.passenger_comment}"
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={trip.status} />
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

            <div className="hidden lg:flex lg:col-span-5 rounded-2xl border border-slate-200 bg-white shadow-sm flex-col h-[580px]">
              <ChatViewer
                trip={selectedTrip}
                messages={chatMessages}
                loading={loadingChat}
                onSendCentral={handleSendCentralMessage}
              />
            </div>
          </div>
        )}

        {/* VISTA 2B: BARRIOS Y VEREDAS DE CALDAS */}
        {tab === 'ZONES' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Formulario + Coordenadas */}
              <form
                onSubmit={handleSaveZone}
                className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {editingZoneId
                        ? `Editando: ${zoneNameInput}`
                        : 'Crear Barrio o Vereda de Caldas'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Marca el punto exacto en el mapa para cotizaciones precisas
                    </p>
                  </div>

                  {editingZoneId && (
                    <button
                      type="button"
                      onClick={startNewZone}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" /> Nuevo
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombre del Barrio o Vereda
                    </label>
                    <input
                      type="text"
                      required
                      value={zoneNameInput}
                      onChange={(e) => setZoneNameInput(e.target.value)}
                      placeholder="Ej: La Rivera, Salinas, La Miel..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Tipo de Sector
                      </label>
                      <select
                        value={zoneTypeInput}
                        onChange={(e) =>
                          setZoneTypeInput(
                            e.target.value as 'BARRIO' | 'VEREDA' | 'PUNTO_INTERES'
                          )
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                      >
                        <option value="BARRIO">Barrio Urbano</option>
                        <option value="VEREDA">Vereda Rural</option>
                        <option value="PUNTO_INTERES">Punto de Interés</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Recargo Rural (COP)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={zoneSurchargeInput}
                        onChange={(e) => setZoneSurchargeInput(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nombres alternativos / Referencias (separados por coma)
                    </label>
                    <input
                      type="text"
                      value={zoneAliasesInput}
                      onChange={(e) => setZoneAliasesInput(e.target.value)}
                      placeholder="Ej: Barrio La Rivera, La Acuarela, Acuarela del Rio"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-0.5">
                        Latitud GPS
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={zoneLatInput}
                        onChange={(e) => setZoneLatInput(Number(e.target.value))}
                        className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-0.5">
                        Longitud GPS
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={zoneLngInput}
                        onChange={(e) => setZoneLngInput(Number(e.target.value))}
                        className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {zoneFeedback && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800">
                    {zoneFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={zoneSaving}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-amber-400 hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {zoneSaving
                    ? 'Guardando...'
                    : editingZoneId
                    ? 'Actualizar Barrio / Vereda'
                    : 'Guardar Barrio / Vereda'}
                </button>
              </form>

              {/* Mapa Interactivo para marcar el punto */}
              <div className="lg:col-span-7">
                <ZoneMapPicker
                  lat={zoneLatInput}
                  lng={zoneLngInput}
                  zones={zones}
                  selectedZoneId={editingZoneId}
                  onPickLocation={(newLat, newLng) => {
                    setZoneLatInput(newLat);
                    setZoneLngInput(newLng);
                  }}
                  onSelectExistingZone={(z) => startEditZone(z)}
                />
              </div>
            </div>

            {/* Listado completo de Barrios y Veredas */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">
                    Base Territorial de Caldas, Antioquia ({zones.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Toca Editar para ajustar el pin en el mapa (ej. Barrio La Rivera) o eliminar un registro
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={zoneTypeFilter}
                    onChange={(e) =>
                      setZoneTypeFilter(
                        e.target.value as 'ALL' | 'BARRIO' | 'VEREDA'
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="ALL">Todos ({zones.length})</option>
                    <option value="BARRIO">
                      Barrios ({zones.filter((z) => z.zone_type === 'BARRIO').length})
                    </option>
                    <option value="VEREDA">
                      Veredas ({zones.filter((z) => z.zone_type === 'VEREDA').length})
                    </option>
                  </select>

                  <div className="relative flex-1 sm:w-60">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={zoneSearch}
                      onChange={(e) => setZoneSearch(e.target.value)}
                      placeholder="Buscar barrio o vereda..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs focus:border-amber-400 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Alias / Referencias</th>
                      <th className="px-4 py-3">Coordenadas</th>
                      <th className="px-4 py-3">Recargo</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {zones
                      .filter((z) => {
                        if (
                          zoneTypeFilter !== 'ALL' &&
                          z.zone_type !== zoneTypeFilter
                        ) {
                          return false;
                        }
                        const q = zoneSearch.toLowerCase().trim();
                        if (!q) return true;
                        return (
                          z.name.toLowerCase().includes(q) ||
                          (z.aliases || '').toLowerCase().includes(q)
                        );
                      })
                      .map((z) => (
                        <tr
                          key={z.id}
                          className={
                            editingZoneId === z.id
                              ? 'bg-amber-50/80'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {z.name}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span
                              className={`rounded-full px-2.5 py-0.5 font-bold ${
                                z.zone_type === 'VEREDA'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : z.zone_type === 'BARRIO'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {z.zone_type === 'VEREDA'
                                ? 'Vereda'
                                : z.zone_type === 'BARRIO'
                                ? 'Barrio'
                                : 'Punto'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px] truncate">
                            {z.aliases || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                            {Number(z.lat).toFixed(5)}, {Number(z.lng).toFixed(5)}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                            {Number(z.surcharge) > 0
                              ? `+${Number(z.surcharge).toLocaleString('es-CO')}`
                              : '$0'}
                          </td>
                          <td className="px-4 py-3 text-right space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                startEditZone(z);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3 w-3" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(z)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA 3: BASE DE DATOS DE CLIENTES / USUARIOS */}
        {tab === 'CLIENTS' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  Base de Datos de Usuarios ({passengers.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Contactos capturados automáticamente con autorización Habeas Data
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
                Aún no hay usuarios registrados que coincidan con la búsqueda.
              </p>
            ) : (
              <>
                <div className="divide-y divide-slate-100 md:hidden">
                  {filteredPassengers.map((p) => (
                    <div key={p.id} className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-900">
                          {p.full_name || 'Sin nombre confirmado'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                            {p.trips_count} viajes
                          </span>
                          <button
                            disabled={deletingKey === `PASSENGER-${p.id}`}
                            onClick={() =>
                              handleDeleteProfile(
                                'PASSENGER',
                                p.id,
                                p.full_name || p.phone
                              )
                            }
                            className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs font-mono text-slate-600">{p.phone}</p>
                      <p className="text-[11px] text-slate-400">
                        Último mensaje:{' '}
                        {new Date(p.last_interaction_at).toLocaleString('es-CO')}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-3">ID</th>
                        <th className="px-5 py-3">Nombre del Usuario</th>
                        <th className="px-5 py-3">Teléfono WhatsApp</th>
                        <th className="px-5 py-3">Habeas Data</th>
                        <th className="px-5 py-3">Servicios</th>
                        <th className="px-5 py-3">Última Interacción</th>
                        <th className="px-5 py-3 text-right">Acciones</th>
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
                          <td className="px-5 py-3 text-right">
                            <button
                              disabled={deletingKey === `PASSENGER-${p.id}`}
                              onClick={() =>
                                handleDeleteProfile(
                                  'PASSENGER',
                                  p.id,
                                  p.full_name || p.phone
                                )
                              }
                              title="Eliminar perfil de usuario"
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Eliminar
                            </button>
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-bold text-slate-900">
                    Solicitudes Pendientes ({pendingDrivers.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Verifica foto de perfil y documento, asigna bono inicial y aprueba.
                  </p>
                </div>

                <button
                  onClick={() => copyText(webDriverRegisterLink, 'DRIVERS_WEB')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100"
                >
                  <Copy className="h-3.5 w-3.5 text-amber-600" />
                  {copiedLabel === 'DRIVERS_WEB'
                    ? '¡Link formulario copiado!'
                    : 'Copiar link formulario web'}
                </button>
              </div>

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

                        <div className="flex flex-wrap justify-end gap-1.5">
                          {drv.profile_photo_path && (
                            <a
                              href={`${backendUrl}/${drv.profile_photo_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-amber-100/70 px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                            >
                              Perfil <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {drv.doc_photo_path && (
                            <a
                              href={`${backendUrl}/${drv.doc_photo_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Doc <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
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
                          className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Rechazar
                        </button>
                        <button
                          disabled={deletingKey === `DRIVER-${drv.id}`}
                          onClick={() =>
                            handleDeleteProfile(
                              'DRIVER',
                              drv.id,
                              `${drv.full_name} (${drv.plate})`
                            )
                          }
                          title="Eliminar perfil"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Borrar
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
                  Base de Datos de Taxistas y Billeteras ({approvedDrivers.length})
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-emerald-700">
                          ${Number(drv.balance).toLocaleString('es-CO')}
                        </span>
                        <button
                          disabled={deletingKey === `DRIVER-${drv.id}`}
                          onClick={() =>
                            handleDeleteProfile(
                              'DRIVER',
                              drv.id,
                              `${drv.full_name} (${drv.plate})`
                            )
                          }
                          className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
                      <th className="px-4 py-3">Taxista</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Calificación</th>
                      <th className="px-4 py-3">Saldo</th>
                      <th className="px-4 py-3">Recarga Rápida</th>
                      <th className="px-4 py-3 text-right">Eliminar</th>
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
                        <td className="px-4 py-3 text-right">
                          <button
                            disabled={deletingKey === `DRIVER-${drv.id}`}
                            onClick={() =>
                              handleDeleteProfile(
                                'DRIVER',
                                drv.id,
                                `${drv.full_name} (${drv.plate})`
                              )
                            }
                            title="Eliminar taxista"
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA 5: LÍNEA WHATSAPP, LINKS DE REGISTRO Y TARIFAS POR KILÓMETRO */}
        {tab === 'WHATSAPP' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Gestión de Teléfono WhatsApp
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Desliga el número actual o vincula uno nuevo para tus pruebas
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

              {/* Generador de Links de Invitación y Registro de Taxistas */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3.5">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-amber-950">
                    Links de Registro para Taxistas
                  </h3>
                  <p className="text-[11px] text-amber-900/80 mt-0.5">
                    Comparte cualquiera de estos dos enlaces para que los conductores creen su perfil:
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">
                    1. Link directo Formulario Web (sin contraseña):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={webDriverRegisterLink}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        copyText(webDriverRegisterLink, 'WEB_LINK')
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copiedLabel === 'WEB_LINK' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-amber-200/70">
                  <label className="block text-[11px] font-bold text-slate-700">
                    2. Mensaje predeterminado vía WhatsApp (editable):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={inviteMsgInput}
                      onChange={(e) => setInviteMsgInput(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    />
                    <button
                      type="button"
                      disabled={waLoading}
                      onClick={() => handleSaveSettings()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Save className="h-3.5 w-3.5" /> Guardar
                    </button>
                  </div>

                  {waDriverInviteLink ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          copyText(waDriverInviteLink, 'WA_INVITE')
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedLabel === 'WA_INVITE'
                          ? '¡Link WhatsApp copiado!'
                          : 'Copiar link WhatsApp'}
                      </button>
                      <a
                        href={waDriverInviteLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
                      >
                        Probar link <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-800">
                      Vincula primero un teléfono WhatsApp para activar el enlace directo `wa.me`.
                    </p>
                  )}
                </div>
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
                  Tarifas por Kilómetro y Parámetros Operativos
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configura el cálculo automático de cotizaciones (Punto A → Punto B), comisiones y administradores
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Banderazo / Base (COP)
                    </label>
                    <input
                      type="number"
                      value={baseFareInput}
                      onChange={(e) => setBaseFareInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Valor por Km (COP/km)
                    </label>
                    <input
                      type="number"
                      value={pricePerKmInput}
                      onChange={(e) => setPricePerKmInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Carrera Mínima (COP)
                    </label>
                    <input
                      type="number"
                      value={minFareInput}
                      onChange={(e) => setMinFareInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                    />
                  </div>
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
                <Save className="h-4 w-4" /> Guardar Tarifas y Parámetros
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Modal de Chat en Mobile / Tablet */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4 lg:hidden">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl flex flex-col h-[84vh] overflow-hidden">
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
                onSendCentral={handleSendCentralMessage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Barra de Navegación Inferior Táctil para Celulares */}
      <nav className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 backdrop-blur py-1.5 md:hidden">
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
          onClick={() => setTab('ZONES')}
          className={`flex flex-col items-center justify-center py-1 text-[10px] font-bold ${
            tab === 'ZONES' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <Compass className="h-5 w-5 mb-0.5" />
          Zonas
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
          Tarifas
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
  onSendCentral,
}: {
  trip: Trip | null;
  messages: ChatMessage[];
  loading: boolean;
  onSendCentral: (
    tripId: number,
    target: 'BOTH' | 'PASSENGER' | 'DRIVER',
    message: string
  ) => Promise<void>;
}) {
  const [replyText, setReplyText] = useState('');
  const [targetRole, setTargetRole] = useState<'BOTH' | 'PASSENGER' | 'DRIVER'>(
    'BOTH'
  );
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trip || !replyText.trim()) return;
    setSending(true);
    try {
      await onSendCentral(trip.id, targetRole, replyText.trim());
      setReplyText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="border-b border-slate-100 px-4 py-3 space-y-1">
        <h3 className="font-bold text-sm text-slate-900">
          {trip
            ? `Auditoría Chat • Servicio #${trip.id}`
            : 'Selecciona un viaje'}
        </h3>
        {trip && (
          <>
            <p className="text-[11px] text-slate-500">
              👤 Usuario: <strong>{trip.passenger_name || 'Sin nombre'}</strong> (
              {trip.passenger_phone}) ↔ 🚕 Taxista:{' '}
              <strong>{trip.driver_plate || 'N/A'}</strong>
            </p>
            {trip.dropoff_address && (
              <p className="text-[11px] font-semibold text-emerald-700">
                🏁 Destino: {trip.dropoff_address} • Valor aprox.: $
                {Number(trip.estimated_fare || 0).toLocaleString('es-CO')} (
                {trip.distance_km} km)
              </p>
            )}
          </>
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
          const isCentral = m.sender_role === 'CENTRAL';
          const isSos = m.message_type === 'SOS';
          return (
            <div
              key={m.id}
              className={`flex flex-col max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                isSos
                  ? 'self-center mx-auto bg-red-600 text-white border border-red-700 font-bold'
                  : isCentral
                  ? 'self-center mx-auto bg-slate-900 text-amber-300 border border-slate-800'
                  : isPassenger
                  ? 'self-start bg-white border border-slate-200 text-slate-800'
                  : 'self-end ml-auto bg-amber-100 border border-amber-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-bold">
                  {isSos
                    ? '🆘 ALERTA SOS'
                    : isCentral
                    ? '🚖 CENTRAL TAXI CALDAS'
                    : isPassenger
                    ? '👤 USUARIO'
                    : '🚕 TAXISTA'}
                </span>
                <span
                  className={`text-[10px] ${
                    isSos
                      ? 'text-red-100'
                      : isCentral
                      ? 'text-slate-400'
                      : 'text-slate-500'
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

      {/* Barra para enviar mensaje directo como CENTRAL TAXI CALDAS */}
      {trip && (trip.status === 'ACTIVE' || trip.status === 'SEARCHING') && (
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-200 bg-white p-2.5 space-y-2"
        >
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-bold text-slate-600">Escribir como Central a:</span>
            <select
              value={targetRole}
              onChange={(e) =>
                setTargetRole(e.target.value as 'BOTH' | 'PASSENGER' | 'DRIVER')
              }
              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold"
            >
              <option value="BOTH">Ambos (Usuario y Taxista)</option>
              <option value="PASSENGER">Solo al Usuario</option>
              <option value="DRIVER">Solo al Taxista</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Escribe un mensaje oficial de Taxi Caldas..."
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !replyText.trim()}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-slate-800 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      )}
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
