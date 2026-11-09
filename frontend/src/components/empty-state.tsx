import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center justify-center gap-2 px-4 py-10 text-center sm:py-12">
      <div className="shrink-0 rounded-full bg-violet-100 p-3 text-[#6d4ae8]">
        <Icon className="size-6" />
      </div>

      <p className="break-words font-medium text-slate-800">
        {title}
      </p>

      <p className="w-full max-w-sm break-words text-sm text-slate-500">
        {text}
      </p>
    </div>
  );
}