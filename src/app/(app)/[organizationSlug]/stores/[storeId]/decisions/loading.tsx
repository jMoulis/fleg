import { Skeleton } from "@/components/ui/skeleton";

export default function DecisionsLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
      <Skeleton className="mt-8 h-56 w-full rounded-xl" />
      <Skeleton className="mt-4 h-72 w-full rounded-xl" />
    </main>
  );
}
