"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Copy,
  LoaderCircle,
  MailPlus,
  Save,
  ShieldCheck,
  Store,
  UserRoundCog,
} from "lucide-react";

import {
  defaultStorePermissionsByRole,
  editableStoreRoleSchema,
  organizationInvitationResponseSchema,
  storeAdminResponseSchema,
  storeCreateInputSchema,
  storeMembershipAdminResponseSchema,
  storeUpdateInputSchema,
  type EditableStoreRole,
  type OrganizationAdminWorkspace,
  type OrganizationMemberAdmin,
  type StoreAdminSummary,
} from "@/domain/admin/schemas";
import {
  storePermissionSchema,
  type StorePermission,
} from "@/domain/stores/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roleLabels: Record<EditableStoreRole, string> = {
  store_director: "Direction magasin",
  department_manager: "Responsable de rayon",
  employee: "Employé",
  viewer: "Lecture seule",
};

const permissionLabels: Record<StorePermission, string> = {
  "stores.read": "Voir le magasin",
  "stores.manage": "Administrer le magasin",
  "analytics.read": "Consulter les analyses",
  "analytics.compare_stores": "Comparer les magasins",
  "imports.create": "Préparer des imports",
  "imports.commit": "Valider des imports",
  "targets.write": "Modifier les objectifs",
  "layouts.write": "Modifier les plans",
  "allocations.write": "Modifier les allocations",
  "markdown.write": "Saisir la démarque",
  "recommendations.approve": "Décider sur les recommandations",
  "tg.publish": "Publier les opérations TG",
  "experiments.read": "Consulter les tests",
  "experiments.write": "Préparer les tests",
  "experiments.start": "Exécuter et analyser les tests",
  "experiments.conclude": "Conclure les tests",
  "experiments.compare_stores": "Utiliser un magasin témoin",
  "settings.write": "Modifier les réglages métier",
  "ai.use": "Utiliser le Copilote",
};

function errorMessage(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return "L’opération n’a pas pu être terminée.";
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload;
}

export function OrganizationAdminPanel({
  invitationEmailConfigured,
  workspace,
}: {
  invitationEmailConfigured: boolean;
  workspace: OrganizationAdminWorkspace;
}) {
  const router = useRouter();
  const [selectedStoreId, setSelectedStoreId] = useState(
    workspace.stores[0]?.id ?? "",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedStore = useMemo(
    () =>
      workspace.stores.find(({ id }) => id === selectedStoreId) ??
      workspace.stores[0] ??
      null,
    [selectedStoreId, workspace.stores],
  );

  function mutationCompleted(message: string) {
    setError(null);
    setNotice(message);
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      <div aria-live="polite" className="grid gap-3">
        {notice ? (
          <Alert>
            <Check aria-hidden="true" />
            <AlertTitle>Modification enregistrée</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Administration impossible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <section aria-labelledby="stores-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">Périmètre métier</p>
            <h2 id="stores-title" className="mt-1 text-2xl font-semibold">
              Magasins
            </h2>
          </div>
          <Badge variant="secondary">{workspace.stores.length}</Badge>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 aria-hidden="true" className="size-5 text-primary" />
                Ajouter un magasin
              </CardTitle>
              <CardDescription>
                Le rayon F&amp;L et un plan de référence modifiable seront créés automatiquement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateStoreForm
                organizationId={workspace.organization.id}
                onError={setError}
                onSuccess={(store) => {
                  setSelectedStoreId(store.id);
                  mutationCompleted(`${store.name} est prêt.`);
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Magasins de l’organisation</CardTitle>
              <CardDescription>
                Les magasins inactifs restent visibles ici pour pouvoir être réactivés.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.stores.length === 0 ? (
                <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                  Aucun magasin. Utilisez le formulaire pour créer le premier périmètre opérationnel.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {workspace.stores.map((store) => (
                    <button
                      aria-pressed={store.id === selectedStoreId}
                      className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/60 aria-pressed:border-primary aria-pressed:bg-primary/5"
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      type="button"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block font-semibold">{store.name}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{store.code}</span>
                        </span>
                        <Badge variant={store.active ? "secondary" : "outline"}>
                          {store.active ? "Actif" : "Inactif"}
                        </Badge>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedStore ? (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store aria-hidden="true" className="size-5 text-primary" />
                Configurer {selectedStore.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StoreSettingsForm
                key={selectedStore.updatedAt}
                onError={setError}
                onSuccess={(store) =>
                  mutationCompleted(`${store.name} a été mis à jour.`)
                }
                store={selectedStore}
              />
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section aria-labelledby="members-title">
        <div>
          <p className="text-sm font-semibold text-primary">Accès humains</p>
          <h2 id="members-title" className="mt-1 text-2xl font-semibold">
            Membres et permissions
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            L’appartenance à l’organisation ne donne pas automatiquement accès à un magasin. Chaque accès ci-dessous est explicite.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailPlus aria-hidden="true" className="size-5 text-primary" />
                Inviter dans l’organisation
              </CardTitle>
              <CardDescription>
                {invitationEmailConfigured
                  ? "Envoyez un lien sécurisé. Après acceptation, attribuez les magasins nécessaires."
                  : "Créez un lien Better Auth à transmettre manuellement. Après acceptation, attribuez les magasins nécessaires."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvitationForm
                emailDeliveryConfigured={invitationEmailConfigured}
                organizationId={workspace.organization.id}
                onError={setError}
                onSuccess={(message) => mutationCompleted(message)}
              />
              {workspace.invitations.length > 0 ? (
                <div className="mt-5 border-t pt-5">
                  <p className="text-sm font-medium">Invitations en attente</p>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {workspace.invitations.map((invitation) => (
                      <li className="rounded-lg bg-muted/60 px-3 py-2" key={invitation.id}>
                        <span className="font-medium">{invitation.email}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {invitation.role === "admin" ? "Admin" : "Membre"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRoundCog aria-hidden="true" className="size-5 text-primary" />
                Accès au magasin sélectionné
              </CardTitle>
              <CardDescription>
                {selectedStore
                  ? `${selectedStore.name} · ${selectedStore.code}`
                  : "Créez ou sélectionnez un magasin pour attribuer les accès."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {workspace.members.map((member) => (
                <MemberAccessCard
                  key={`${member.userId}:${selectedStore?.id ?? "none"}`}
                  member={member}
                  onError={setError}
                  onSuccess={(message) => mutationCompleted(message)}
                  store={selectedStore}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function CreateStoreForm({
  organizationId,
  onError,
  onSuccess,
}: {
  organizationId: string;
  onError: (message: string) => void;
  onSuccess: (store: StoreAdminSummary) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const parsed = storeCreateInputSchema.safeParse({
      organizationId,
      name: values.get("name"),
      code: values.get("code"),
      idempotencyKey: crypto.randomUUID(),
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Formulaire invalide");
      return;
    }
    setPending(true);
    try {
      const result = storeAdminResponseSchema.parse(
        await requestJson("/api/stores", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        }),
      );
      form.reset();
      onSuccess(result.store);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Création impossible");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="new-store-name">Nom</Label>
        <Input id="new-store-name" name="name" placeholder="Ex. Lille Centre" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-store-code">Code</Label>
        <Input id="new-store-code" name="code" placeholder="LIL-01" required />
      </div>
      <Button disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Store aria-hidden="true" />}
        Créer le magasin
      </Button>
    </form>
  );
}

function StoreSettingsForm({
  onError,
  onSuccess,
  store,
}: {
  onError: (message: string) => void;
  onSuccess: (store: StoreAdminSummary) => void;
  store: StoreAdminSummary;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const parsed = storeUpdateInputSchema.safeParse({
      name: values.get("name"),
      code: values.get("code"),
      active: values.get("active") === "on",
      basedOnUpdatedAt: store.updatedAt,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Formulaire invalide");
      return;
    }
    setPending(true);
    try {
      const result = storeAdminResponseSchema.parse(
        await requestJson(`/api/stores/${store.id}`, {
          method: "PATCH",
          body: JSON.stringify(parsed.data),
        }),
      );
      onSuccess(result.store);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Mise à jour impossible");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor={`store-name-${store.id}`}>Nom</Label>
        <Input defaultValue={store.name} id={`store-name-${store.id}`} name="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`store-code-${store.id}`}>Code</Label>
        <Input defaultValue={store.code} id={`store-code-${store.id}`} name="code" required />
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
        <input className="size-4 accent-primary" defaultChecked={store.active} name="active" type="checkbox" />
        Magasin actif
      </label>
      <Button className="md:justify-self-end" disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
        Enregistrer
      </Button>
    </form>
  );
}

function InvitationForm({
  emailDeliveryConfigured,
  organizationId,
  onError,
  onSuccess,
}: {
  emailDeliveryConfigured: boolean;
  organizationId: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<"member" | "admin">("member");
  const [acceptPath, setAcceptPath] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = formData.get("email");
    const resend = formData.get("resend") === "on";
    setPending(true);
    try {
      const result = organizationInvitationResponseSchema.parse(
        await requestJson(`/api/organizations/${organizationId}/invitations`, {
          method: "POST",
          body: JSON.stringify({ email, role, resend }),
        }),
      );
      setAcceptPath(result.acceptPath);
      form.reset();
      if (result.delivery.status === "failed") {
        onError(
          `Invitation créée pour ${result.invitation.email}, mais l’e-mail n’a pas été envoyé. Copiez le lien ou renvoyez l’invitation.`,
        );
      } else {
        onSuccess(
          result.delivery.status === "sent"
            ? `Invitation envoyée à ${result.invitation.email}.`
            : `Invitation créée pour ${result.invitation.email}.`,
        );
      }
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Invitation impossible");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!acceptPath) return;
    await navigator.clipboard.writeText(`${window.location.origin}${acceptPath}`);
    onSuccess("Lien d’invitation copié.");
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="invitation-email">Adresse e-mail</Label>
        <Input id="invitation-email" name="email" type="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invitation-role">Rôle organisation</Label>
        <Select onValueChange={(value) => setRole(value === "admin" ? "admin" : "member")} value={role}>
          <SelectTrigger id="invitation-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Membre</SelectItem>
            <SelectItem value="admin">Administrateur</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input className="size-4 accent-primary" name="resend" type="checkbox" />
        Renvoyer si une invitation est déjà en attente
      </label>
      <Button disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <MailPlus aria-hidden="true" />}
        {emailDeliveryConfigured ? "Envoyer l’invitation" : "Créer le lien"}
      </Button>
      {acceptPath ? (
        <Button onClick={copyLink} type="button" variant="outline">
          <Copy aria-hidden="true" /> Copier le lien d’acceptation
        </Button>
      ) : null}
    </form>
  );
}

function MemberAccessCard({
  member,
  onError,
  onSuccess,
  store,
}: {
  member: OrganizationMemberAdmin;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  store: StoreAdminSummary | null;
}) {
  const existing = member.storeAccesses.find(
    (access) => access.storeId === store?.id,
  );
  const [role, setRole] = useState<EditableStoreRole>(
    existing?.role ?? "viewer",
  );
  const [permissions, setPermissions] = useState<StorePermission[]>(
    existing?.permissions ?? [...defaultStorePermissionsByRole.viewer],
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [pending, setPending] = useState(false);
  const implicit = member.organizationRole !== "member";

  function changeRole(value: string | null) {
    const nextRole = editableStoreRoleSchema.parse(value);
    setRole(nextRole);
    setPermissions([...defaultStorePermissionsByRole[nextRole]]);
  }

  function togglePermission(permission: StorePermission, checked: boolean) {
    setPermissions((current) =>
      checked
        ? Array.from(new Set([...current, permission]))
        : current.filter((candidate) => candidate !== permission),
    );
  }

  async function save() {
    if (!store) return;
    setPending(true);
    try {
      const result = storeMembershipAdminResponseSchema.parse(
        await requestJson(`/api/stores/${store.id}/members`, {
          method: "POST",
          body: JSON.stringify({
            userId: member.userId,
            role,
            permissions,
            active,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      );
      onSuccess(
        `${member.name} : accès ${result.membership.active ? "actif" : "désactivé"}.`,
      );
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Accès impossible");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{member.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{member.email}</p>
        </div>
        <Badge variant={implicit ? "default" : existing?.active ? "secondary" : "outline"}>
          {implicit
            ? member.organizationRole === "owner"
              ? "Propriétaire"
              : "Admin organisation"
            : existing?.active
              ? "Accès actif"
              : "Sans accès"}
        </Badge>
      </div>

      {implicit ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Accès complet hérité du rôle d’organisation.
        </p>
      ) : store ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`role-${member.userId}`}>Rôle magasin</Label>
              <Select onValueChange={changeRole} value={role}>
                <SelectTrigger id={`role-${member.userId}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editableStoreRoleSchema.options.map((option) => (
                    <SelectItem key={option} value={option}>{roleLabels[option]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border px-3 text-sm">
              <input checked={active} className="size-4 accent-primary" onChange={(event) => setActive(event.target.checked)} type="checkbox" />
              Accès actif
            </label>
          </div>
          <details className="rounded-lg border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Permissions détaillées ({permissions.length})
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {storePermissionSchema.options.map((permission) => (
                <label className="flex items-start gap-2 text-sm" key={permission}>
                  <input
                    checked={permissions.includes(permission)}
                    className="mt-0.5 size-4 accent-primary"
                    disabled={permission === "stores.read" && active}
                    onChange={(event) => togglePermission(permission, event.target.checked)}
                    type="checkbox"
                  />
                  {permissionLabels[permission]}
                </label>
              ))}
            </div>
          </details>
          <Button disabled={pending || !store.active} onClick={save} type="button">
            {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
            Enregistrer l’accès
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Aucun magasin sélectionné.</p>
      )}
    </article>
  );
}
