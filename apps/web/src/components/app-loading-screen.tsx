type LoadingStatusProps = {
  description: string;
  title: string;
};

type AppLoadingScreenProps = Partial<LoadingStatusProps>;

function LoadingStatus({ description, title }: LoadingStatusProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div aria-hidden="true" className="size-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
      <div>
        <p className="text-base font-bold text-slate-950">{title}</p>
        <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function AppLoadingScreen({
  description = "필요한 데이터를 준비하고 있습니다.",
  title = "화면을 불러오는 중"
}: AppLoadingScreenProps) {
  return (
    <div aria-live="polite" className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-6 py-16" role="status">
      <LoadingStatus description={description} title={title} />
    </div>
  );
}

export function AppLoadingOverlay({ description, title }: LoadingStatusProps) {
  return (
    <div
      aria-live="polite"
      className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/10 px-6"
      role="status"
    >
      <div className="rounded-lg border border-slate-200 bg-white/95 px-6 py-5 shadow-xl">
        <LoadingStatus description={description} title={title} />
      </div>
    </div>
  );
}
