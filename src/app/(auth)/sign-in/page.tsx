import type { Metadata } from "next";
import { Leaf, ShieldCheck } from "lucide-react";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Connexion — F&L Cockpit",
  description: "Accédez à vos magasins autorisés dans F&L Cockpit.",
};

export default function SignInPage() {
  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-80 rounded-full border border-white/15" />
        <div className="absolute -right-10 top-16 size-52 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white/12">
            <Leaf aria-hidden="true" className="size-6" />
          </span>
          <div>
            <p className="font-semibold">F&amp;L Cockpit</p>
            <p className="text-sm text-primary-foreground/70">Pilotage multi-magasin</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold text-primary-foreground/70">Votre contexte, toujours visible</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-0.045em]">
            Les bonnes décisions commencent par le bon magasin.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-primary-foreground/75">
            Chaque accès est contrôlé côté serveur selon votre organisation, votre rôle et vos permissions magasin.
          </p>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-primary-foreground/70">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Better Auth · isolation magasin · journalisation
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <p className="font-semibold">F&amp;L Cockpit</p>
          </div>
          <Card className="border-primary/10 shadow-[0_24px_70px_-35px_color-mix(in_oklch,var(--primary),transparent_50%)]">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">Bienvenue</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Connectez-vous pour retrouver uniquement les magasins qui vous sont autorisés.
              </p>
            </CardHeader>
            <CardContent>
              <SignInForm />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
