import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
      <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="mt-6 h-96" />
    </main>
  );
}
