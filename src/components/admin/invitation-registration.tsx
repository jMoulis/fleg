"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, UserPlus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  invitationRegistrationInputSchema,
  invitationRegistrationResponseSchema,
  type InvitationRegistrationContext,
} from "@/domain/admin/schemas";

export function InvitationRegistration({
  registration,
}: {
  registration: InvitationRegistrationContext;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = `/invitations/${encodeURIComponent(
    registration.invitationId,
  )}`;
  const signInPath = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const password = formData.get("password");
    if (password !== formData.get("passwordConfirmation")) {
      setError("Les deux mots de passe doivent être identiques.");
      return;
    }
    const parsed = invitationRegistrationInputSchema.safeParse({
      name: formData.get("name"),
      password,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Le formulaire est invalide.",
      );
      return;
    }

    setPending(true);
    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(
          registration.invitationId,
        )}/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "Le compte n’a pas pu être créé.";
        throw new Error(message);
      }
      const result = invitationRegistrationResponseSchema.parse(payload);
      router.replace(result.nextPath);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Inscription impossible",
      );
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <UserPlus aria-hidden="true" className="size-6" />
        </span>
        <CardTitle className="pt-3 text-2xl">
          Rejoindre {registration.organizationName}
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          Invitation destinée à {registration.maskedEmail}. L’accès aux magasins
          sera attribué séparément par un administrateur.
        </p>
      </CardHeader>
      <CardContent>
        {registration.recipientHasAccount ? (
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Un compte existe déjà pour cette adresse. Connectez-vous pour
              accepter l’invitation.
            </p>
            <Link className={buttonVariants({ size: "lg" })} href={signInPath}>
              Se connecter <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <form className="grid gap-4" noValidate onSubmit={submit}>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Inscription impossible</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="invitation-name">Nom complet</Label>
              <Input
                autoComplete="name"
                disabled={pending}
                id="invitation-name"
                name="name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitation-password">Mot de passe</Label>
              <Input
                autoComplete="new-password"
                disabled={pending}
                id="invitation-password"
                minLength={12}
                name="password"
                required
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                12 caractères minimum.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invitation-password-confirmation">
                Confirmer le mot de passe
              </Label>
              <Input
                autoComplete="new-password"
                disabled={pending}
                id="invitation-password-confirmation"
                minLength={12}
                name="passwordConfirmation"
                required
                type="password"
              />
            </div>
            <Button disabled={pending} size="lg" type="submit">
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <UserPlus aria-hidden="true" />
              )}
              Créer mon compte
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
