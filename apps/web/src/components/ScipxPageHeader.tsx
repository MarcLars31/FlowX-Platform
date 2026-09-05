export function ScipxPageHeader({
  eyebrow,
  title,
  description,
  icon,
  children
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#03162d] p-5 text-white shadow-[0_18px_45px_rgba(2,17,38,0.16)] sm:p-7">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(66,173,217,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(66,173,217,0.075)_1px,transparent_1px)] bg-[size:28px_28px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(34,211,238,0.18),transparent_32%),linear-gradient(90deg,transparent,rgba(3,22,45,0.4))]"
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute -bottom-12 right-0 h-44 w-[460px] text-cyan-200/10"
        viewBox="0 0 460 180"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 120h110V72h84v48h82V45h76v75h108" stroke="currentColor" strokeWidth="3" />
        <path d="M0 128h118V80h68v48h98V53h60v75h116" stroke="currentColor" />
        <circle cx="150" cy="124" r="40" stroke="currentColor" strokeWidth="2" />
        <circle cx="314" cy="124" r="53" stroke="currentColor" strokeWidth="2" />
      </svg>

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-300 [&_svg]:h-6 [&_svg]:w-6">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-300">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight tracking-[-0.025em] text-white sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div className="relative shrink-0">{children}</div>}
      </div>
    </header>
  );
}
