import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationAdminLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-10 sm:px-6 lg:px-8" aria-label="Chargement de l’administration">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-72 w-full" />
    </main>
  );
}
