import type { Metadata } from "next";
import { Leaf, ShieldCheck } from "lucide-react";

import { StoreSelector } from "@/components/stores/store-selector";

export const metadata: Metadata = {
  title: "Choisir un magasin — F&L Cockpit",
  description: "Sélectionnez un magasin parmi vos accès autorisés.",
};

export default function StoresPage() {
  return (
    <main className="min-h-svh bg-muted/35">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-5 sm:px-8">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-semibold">F&amp;L Cockpit</p>
            <p className="text-xs text-muted-foreground">Contexte de travail</p>
          </div>
        </div>
      </header>
      <section className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-20">
        <div className="mb-8">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Accès vérifiés côté serveur
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
            Choisissez votre magasin
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            La liste contient uniquement les magasins autorisés pour votre compte et votre organisation.
          </p>
        </div>
        <StoreSelector />
      </section>
    </main>
  );
}
