"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInInputSchema } from "@/domain/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { forgetPreparedWorkspace } from "@/lib/offline/database";

export function SignInForm({
  callbackUrl = "/stores",
  registrationCompleted = false,
}: {
  callbackUrl?: string;
  registrationCompleted?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const input = signInInputSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Formulaire invalide");
      return;
    }

    setPending(true);
    // Also covers an initial/uncontrolled tab before the service worker claims it.
    try {
      await forgetPreparedWorkspace();
    } catch {
      setError("Impossible de sécuriser la copie locale. Fermez les autres onglets et réessayez. Ne supprimez pas les données du site si vous avez des brouillons locaux à conserver.");
      setPending(false);
      return;
    }
    const result = await authClient.signIn.email({
      ...input.data,
      rememberMe: true,
    });
    setPending(false);

    if (result.error) {
      setError("Identifiants invalides ou service indisponible.");
      return;
    }

    router.replace(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        {registrationCompleted ? (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Compte créé</AlertTitle>
            <AlertDescription>
              Connectez-vous pour accepter votre invitation.
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Connexion impossible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <FieldLabel htmlFor="email">Adresse e-mail</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="prenom@entreprise.fr"
            disabled={pending}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            disabled={pending}
            minLength={8}
            required
          />
          <FieldDescription>
            Utilisez le compte communiqué par votre administrateur réseau.
          </FieldDescription>
          <FieldError />
        </Field>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : null}
          Se connecter
          {!pending ? <ArrowRight data-icon="inline-end" aria-hidden="true" /> : null}
        </Button>
      </FieldGroup>
    </form>
  );
}
