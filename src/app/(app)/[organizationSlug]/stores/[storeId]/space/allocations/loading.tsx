import { Skeleton } from "@/components/ui/skeleton";

export default function AllocationLoading() {
  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-5 h-10 w-80 max-w-full" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-28" key={index} />
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <Skeleton className="h-[34rem]" />
        <Skeleton className="h-[34rem]" />
        <Skeleton className="h-[34rem]" />
      </div>
    </main>
  );
}
