"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, MailCheck } from "lucide-react";

import {
  invitationAcceptResponseSchema,
  type RecipientInvitation,
} from "@/domain/admin/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InvitationAcceptance({
  invitation,
}: {
  invitation: RecipientInvitation;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/${invitation.id}/accept`, {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("L’invitation n’a pas pu être acceptée.");
      invitationAcceptResponseSchema.parse(payload);
      router.replace("/stores");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Acceptation impossible");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <MailCheck aria-hidden="true" className="size-6" />
          </span>
          <Badge variant="secondary">
            {invitation.role === "admin" ? "Administrateur" : "Membre"}
          </Badge>
        </div>
        <CardTitle className="pt-3 text-2xl">Rejoindre {invitation.organizationName}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">
          Invitation envoyée à {invitation.email} par {invitation.inviterEmail}. Après acceptation, un administrateur pourra vous attribuer les magasins nécessaires.
        </p>
        {error ? (
          <Alert className="mt-5" variant="destructive">
            <AlertTitle>Acceptation impossible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button className="mt-6 w-full" disabled={pending} onClick={accept} size="lg" type="button">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          Accepter l’invitation
          {!pending ? <ArrowRight aria-hidden="true" data-icon="inline-end" /> : null}
        </Button>
      </CardContent>
    </Card>
  );
}
