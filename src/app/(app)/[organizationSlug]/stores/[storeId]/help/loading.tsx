import { Skeleton } from "@/components/ui/skeleton";

export default function StoreHelpLoading() {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10"
      aria-label="Chargement du guide utilisateur"
    >
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-3 h-10 w-80 max-w-full" />
      <Skeleton className="mt-4 h-5 w-full max-w-2xl" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
