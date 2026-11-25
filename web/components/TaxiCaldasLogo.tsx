export default function TaxiCaldasLogo({
  size = 'md',
  darkText = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  darkText?: boolean;
}) {
  const iconDim = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`${iconDim} relative flex shrink-0 items-center justify-center rounded-xl bg-slate-900 p-1.5 shadow-md ring-2 ring-amber-400`}
      >
        <svg viewBox="0 0 64 64" className="h-full w-full">
          {/* Letrero superior */}
          <rect x="22" y="6" width="20" height="7" rx="2" fill="#facc15" />
          {/* Cabina */}
          <path
            d="M14 28 L20 14 C21 12 23 11 25 11 L39 11 C41 11 43 12 44 14 L50 28 Z"
            fill="#facc15"
          />
          <path d="M19 26 L23 16 L41 16 L45 26 Z" fill="#0f172a" />
          {/* Carroceria */}
          <rect x="8" y="27" width="48" height="22" rx="6" fill="#facc15" />
          {/* Franja ajedrezada */}
          <rect x="12" y="36" width="40" height="5" fill="#0f172a" />
          <rect x="14" y="36.5" width="4" height="2" fill="#facc15" />
          <rect x="22" y="36.5" width="4" height="2" fill="#facc15" />
          <rect x="30" y="36.5" width="4" height="2" fill="#facc15" />
          <rect x="38" y="36.5" width="4" height="2" fill="#facc15" />
          <rect x="46" y="36.5" width="4" height="2" fill="#facc15" />
          <rect x="18" y="38.5" width="4" height="2" fill="#facc15" />
          <rect x="26" y="38.5" width="4" height="2" fill="#facc15" />
          <rect x="34" y="38.5" width="4" height="2" fill="#facc15" />
          <rect x="42" y="38.5" width="4" height="2" fill="#facc15" />
          {/* Faros */}
          <circle cx="15" cy="32" r="2.8" fill="#ffffff" />
          <circle cx="49" cy="32" r="2.8" fill="#ffffff" />
          {/* Llantas */}
          <rect x="13" y="48" width="9" height="8" rx="2" fill="#020617" />
          <rect x="42" y="48" width="9" height="8" rx="2" fill="#020617" />
        </svg>
      </div>

      <div className="leading-tight">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-black tracking-tight ${
              size === 'lg' ? 'text-2xl' : 'text-base sm:text-lg'
            } ${darkText ? 'text-slate-900' : 'text-white'}`}
          >
            TAXI <span className="text-amber-500">CALDAS</span>
          </span>
        </div>
        <p
          className={`text-[11px] font-medium ${
            darkText ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          Central de Despacho
        </p>
      </div>
    </div>
  );
}
