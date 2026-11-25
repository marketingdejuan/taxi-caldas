export default function TaxiCaldasLogo({
  size = 'md',
  theme = 'dark',
}: {
  size?: 'sm' | 'md' | 'lg';
  theme?: 'dark' | 'light';
}) {
  const boxClass =
    size === 'sm'
      ? 'h-9 w-9 rounded-xl'
      : size === 'lg'
      ? 'h-12 w-12 rounded-2xl'
      : 'h-10 w-10 rounded-xl';

  const svgPx = size === 'sm' ? 22 : size === 'lg' ? 28 : 24;

  const titleClass =
    size === 'sm'
      ? 'text-base'
      : size === 'lg'
      ? 'text-xl'
      : 'text-lg';

  const isLightText = theme === 'dark';

  return (
    <div className="inline-flex items-center gap-3 select-none">
      <div
        className={`${boxClass} flex shrink-0 items-center justify-center bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 text-slate-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-300/60`}
      >
        <svg
          width={svgPx}
          height={svgPx}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          {/* Letrero TAXI superior */}
          <rect x="8.5" y="2.5" width="7" height="2.5" rx="1" fill="#0f172a" />
          {/* Cabina */}
          <path
            d="M5.2 10.5L6.8 6.2C7.1 5.5 7.8 5 8.6 5H15.4C16.2 5 16.9 5.5 17.2 6.2L18.8 10.5H5.2Z"
            fill="#0f172a"
          />
          {/* Carrocería */}
          <rect x="3" y="10" width="18" height="7.5" rx="2.5" fill="#0f172a" />
          {/* Faros amarillos */}
          <circle cx="6.2" cy="13.5" r="1.3" fill="#facc15" />
          <circle cx="17.8" cy="13.5" r="1.3" fill="#facc15" />
          {/* Parrilla ajedrezada */}
          <rect x="9.5" y="12.6" width="5" height="1.8" rx="0.6" fill="#facc15" />
          {/* Llantas */}
          <rect x="4.8" y="17.2" width="3.2" height="2.8" rx="1" fill="#0f172a" />
          <rect x="16" y="17.2" width="3.2" height="2.8" rx="1" fill="#0f172a" />
        </svg>
      </div>

      <div className="flex flex-col leading-none">
        <span
          className={`${titleClass} font-extrabold tracking-tight ${
            isLightText ? 'text-white' : 'text-slate-900'
          }`}
        >
          Taxi <span className="text-amber-400">Caldas</span>
        </span>
        <span
          className={`mt-1 text-[10px] font-semibold uppercase tracking-widest ${
            isLightText ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          Central Operativa
        </span>
      </div>
    </div>
  );
}
