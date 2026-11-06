import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="rounded-full bg-violet-100 p-3 text-[#6d4ae8]">
        <Icon className="size-6" />
      </div>
      <p className="font-medium text-slate-800">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{text}</p>
    </div>
  );
}
