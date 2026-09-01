"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Store } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { storesResponseSchema, type StoreSummary } from "@/domain/stores/schemas";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stores: StoreSummary[] };

export function StoreSelector() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [storeId, setStoreId] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadStores() {
      try {
        const response = await fetch("/api/stores", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (response.status === 401) {
          router.replace("/sign-in");
          return;
        }

        if (!response.ok) {
          throw new Error("STORE_API_ERROR");
        }

        const result = storesResponseSchema.safeParse(await response.json());

        if (!result.success) {
          throw new Error("INVALID_STORE_RESPONSE");
        }

        setState({ status: "ready", stores: result.data.stores });
        setStoreId(result.data.stores[0]?.id ?? "");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          message: "Impossible de charger vos magasins pour le moment.",
        });
      }
    }

    void loadStores();
    return () => controller.abort();
  }, [router]);

  if (state.status === "loading") {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6" aria-label="Chargement des magasins">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Chargement impossible</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  if (state.stores.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Store aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-5 font-semibold">Aucun magasin disponible</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Demandez à un administrateur de vous ajouter à un magasin de votre organisation.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedStore = state.stores.find((store) => store.id === storeId);

  function openStore() {
    if (!selectedStore) {
      return;
    }

    router.push(
      `/${selectedStore.organizationSlug}/stores/${selectedStore.id}/dashboard`,
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Field>
          <FieldLabel>Magasin actif</FieldLabel>
          <Select value={storeId} onValueChange={(value) => setStoreId(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choisir un magasin" />
            </SelectTrigger>
            <SelectContent>
              {state.stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name} · {store.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Cette préférence facilite la navigation ; chaque page revérifie vos droits côté serveur.
          </FieldDescription>
        </Field>
        <Button className="mt-6 w-full" size="lg" onClick={openStore} disabled={!selectedStore}>
          Ouvrir le cockpit
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}
