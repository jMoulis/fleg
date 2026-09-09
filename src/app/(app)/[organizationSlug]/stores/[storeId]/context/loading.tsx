import { Skeleton } from "@/components/ui/skeleton";

export default function BusinessContextLoading() {
  return (
    <main className="mx-auto w-full max-w-[105rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-3 h-10 w-96 max-w-full" />
      <Skeleton className="mt-3 h-5 w-full max-w-3xl" />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-[36rem] rounded-xl" />
        <Skeleton className="h-[30rem] rounded-xl" />
      </div>
      <Skeleton className="mt-6 h-[34rem] rounded-xl" />
    </main>
  );
}
