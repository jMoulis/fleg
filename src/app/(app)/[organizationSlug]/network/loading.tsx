import { Skeleton } from "@/components/ui/skeleton";

export default function NetworkLoading() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-10 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-80" />
    </main>
  );
}
