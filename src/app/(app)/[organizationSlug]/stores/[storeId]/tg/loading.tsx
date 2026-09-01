import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TgLoading() {
  return (
    <main className="mx-auto w-full max-w-[105rem] px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-3 h-10 w-96 max-w-full" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardContent className="grid min-h-[30rem] grid-cols-7 gap-2 pt-4">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton className="h-full" key={index} />
            ))}
          </CardContent>
        </Card>
        <Skeleton className="min-h-[36rem] rounded-xl" />
      </div>
    </main>
  );
}
