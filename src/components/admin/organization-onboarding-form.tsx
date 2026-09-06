"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, LoaderCircle } from "lucide-react";

import {
  organizationCreateInputSchema,
  organizationCreateResponseSchema,
} from "@/domain/admin/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OrganizationOnboardingForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const values = new FormData(event.currentTarget);
    const parsed = organizationCreateInputSchema.safeParse({
      name: values.get("organizationName"),
      slug: values.get("slug"),
      firstStore: {
        name: values.get("storeName"),
        code: values.get("storeCode"),
      },
      idempotencyKey: crypto.randomUUID(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formulaire invalide");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
            ? payload.message
            : "Création impossible",
        );
      }
      const result = organizationCreateResponseSchema.parse(payload);
      router.replace(`/${result.organization.slug}/admin`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible");
      setPending(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submit} noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Création impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="organization-name">Nom de l’organisation</Label>
        <Input
          id="organization-name"
          name="organizationName"
          onBlur={(event) => {
            if (!slug) setSlug(slugify(event.target.value));
          }}
          placeholder="Ex. Réseau Nord"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="organization-slug">Identifiant URL</Label>
        <Input
          id="organization-slug"
          name="slug"
          onChange={(event) => setSlug(slugify(event.target.value))}
          placeholder="reseau-nord"
          required
          value={slug}
        />
        <p className="text-xs text-muted-foreground">
          Minuscules, chiffres et tirets uniquement. Cet identifiant apparaîtra dans les URLs.
        </p>
      </div>
      <div className="border-t pt-5">
        <p className="flex items-center gap-2 font-semibold">
          <Building2 aria-hidden="true" className="size-5 text-primary" />
          Premier magasin
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="first-store-name">Nom</Label>
            <Input id="first-store-name" name="storeName" placeholder="Lille Centre" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="first-store-code">Code</Label>
            <Input id="first-store-code" name="storeCode" placeholder="LIL-01" required />
          </div>
        </div>
      </div>
      <Button disabled={pending} size="lg" type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
        Créer l’organisation et le magasin
        {!pending ? <ArrowRight aria-hidden="true" data-icon="inline-end" /> : null}
      </Button>
    </form>
  );
}
