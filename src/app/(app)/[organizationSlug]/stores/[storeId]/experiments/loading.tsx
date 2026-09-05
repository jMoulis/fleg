import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExperimentsLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-52" />
      <Skeleton className="mt-3 h-10 w-80 max-w-full" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-9 w-28" key={index} />
        ))}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent className="space-y-4 py-5">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
