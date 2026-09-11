import { Leaf } from "lucide-react";

export function AppBrand({ subtitle }: { subtitle: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Leaf aria-hidden="true" className="size-5" />
      </span>
      <span className="hidden sm:block">
        <span className="block text-sm font-semibold leading-4">
          F&amp;L Cockpit
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </span>
  );
}
