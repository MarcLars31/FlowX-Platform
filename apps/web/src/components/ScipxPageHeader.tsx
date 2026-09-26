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
    <header className="portal-page-header">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="portal-heading-icon flex h-8 w-8 shrink-0 items-center justify-center border border-ink-400 bg-ink-100 text-ink-900 [&_svg]:h-5 [&_svg]:w-5">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-600">
              {eyebrow}
            </p>
            <h1 className="mt-1 text-xl font-bold leading-tight text-ink-950">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm text-ink-600">
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
