import { Skeleton } from "@/components/ui/skeleton";

export default function MarkdownLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="mt-3 h-10 w-56" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </main>
  );
}
