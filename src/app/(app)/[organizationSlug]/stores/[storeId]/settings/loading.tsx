import { Skeleton } from "@/components/ui/skeleton";

export default function StoreSettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
      <Skeleton className="mt-8 h-64 w-full rounded-xl" />
      <Skeleton className="mt-6 h-96 w-full rounded-xl" />
    </main>
  );
}
