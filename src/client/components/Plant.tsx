/** Line-drawn monstera — the app's only illustration (empty states). */
export default function Plant({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden>
      <g stroke="var(--positive)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M60 100 V55" />
        <path d="M60 74 C45 68 36 55 38 40 C52 42 62 54 60 74Z" />
        <path d="M60 66 C74 60 84 48 82 33 C68 35 57 46 60 66Z" />
        <path d="M60 55 C50 45 48 32 55 20 C65 28 68 42 60 55Z" />
        <path d="M44 51 L52 55 M78 44 L70 49 M58 30 L60 38" />
      </g>
      <g stroke="var(--timber)" strokeWidth="1.5">
        <path d="M42 100 H78 L74 118 H46 Z" />
        <path d="M42 100 L78 100" />
      </g>
    </svg>
  );
}
