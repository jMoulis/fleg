"use client";

import { liveQuery } from "dexie";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CircleHelp,
  Download,
  Store,
  Warehouse,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AppBrand } from "@/components/app-shell/app-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  offlineFreshness,
  offlineAccessSchema,
  preparedWorkspaceSchema,
  sameOfflineIdentity,
  type PreparedWorkspace,
} from "@/domain/offline/schemas";
import { inventoryWorkspaceQuerySchema } from "@/domain/inventory/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";
import { draftScope } from "@/domain/offline/inventory-draft";
import { LocalInventoryEditor } from "./local-inventory-editor";
import {
  forgetPreparedWorkspace,
  preparationEpoch,
  readPreparedWorkspace,
  savePreparedWorkspace,
} from "@/lib/offline/database";
import {
  registerFieldWorker,
  verifyFieldShell,
} from "@/lib/offline/service-worker";

const pageSize = 25;
const formatTime = (value: string) => new Date(value).toLocaleString("fr-FR");

function openHelp() {
  const help = document.getElementById("offline-help");
  if (help instanceof HTMLDetailsElement) help.open = true;
}

async function checkAccess(workspace: PreparedWorkspace) {
  let response: Response;
  try {
    response = await fetch(
      `/api/stores/${workspace.identity.storeId}/offline/access`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
  } catch (error) {
    // onLine is only a hint (Wi-Fi can be associated with no working uplink).
    if (
      error instanceof TypeError ||
      (error instanceof DOMException &&
        ["TimeoutError", "AbortError"].includes(error.name))
    )
      return null;
    throw error;
  }
  if ([401, 403, 404].includes(response.status)) return false;
  if (!response.ok)
    throw new Error(
      "Vérification des accès indisponible. Réessayez avec du réseau.",
    );
  const access = offlineAccessSchema.parse(await response.json());
  return (
    sameOfflineIdentity(workspace.identity, access) &&
    (!workspace.canWriteInventory || access.canWriteInventory)
  );
}

export function OfflineWorkspace({ enabled }: { enabled: boolean }) {
  const [workspace, setWorkspace] = useState<PreparedWorkspace | null>(null);
  const [target, setTarget] = useState({ storeId: "", businessDate: "" });
  const [connected, setConnected] = useState(true);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [now, setNow] = useState(0);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [page, setPage] = useState(1);
  const [localBusy, setLocalBusy] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessCheck, setAccessCheck] = useState(0);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [autoPrepare, setAutoPrepare] = useState(false);
  const [openingComplete, setOpeningComplete] = useState(false);
  const [organizationSlug, setOrganizationSlug] = useState("");
  const attemptedPreparation = useRef(false);

  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    let registration: ServiceWorkerRegistration | undefined;
    const readUpdate = () => setUpdateAvailable(Boolean(registration?.waiting));
    const trackUpdate = () => {
      registration?.installing?.addEventListener("statechange", readUpdate);
      readUpdate();
    };
    const query = new URL(window.location.href).searchParams;
    const requestedStore = storeIdSchema.safeParse(query.get("storeId"));
    const requestedDate = inventoryWorkspaceQuerySchema.safeParse({
      businessDate: query.get("businessDate"),
    });
    const initialTarget = {
      storeId: requestedStore.success ? requestedStore.data : "",
      businessDate: requestedDate.success
        ? requestedDate.data.businessDate
        : "",
    };

    async function restore() {
      const current = ++sequence;
      setLoading(true);
      // Keep the editor mounted during rechecks so a failed/pending write is
      // not silently discarded by a focus/reconnect event. Its UI is locked.
      setAccessAllowed(false);
      setConnected(navigator.onLine);
      if (!navigator.onLine) setOpeningComplete(true);
      setNow(Date.now());
      setTarget(initialTarget);
      try {
        const copy = await readPreparedWorkspace();
        if (disposed || current !== sequence) return;
        setAutoPrepare(query.get("open") === "1");
        setOrganizationSlug(query.get("organizationSlug") ?? "");
        if (!copy) setWorkspace(null);
        if (copy && offlineFreshness(copy, Date.now()) === "purged") {
          setWorkspace(null);
          await forgetPreparedWorkspace();
          return;
        }
        if (copy && navigator.onLine) {
          const access = await checkAccess(copy);
          if (disposed || current !== sequence) return;
          if (access === false) {
            setWorkspace(null);
            await forgetPreparedWorkspace();
            if (!disposed)
              setError(
                "Session ou accès modifié : préparez à nouveau le magasin après connexion.",
              );
            return;
          }
          if (access === null && !disposed && current === sequence) {
            setConnected(false);
            setOpeningComplete(true);
          }
        }
        if (disposed || current !== sequence) return;
        if (!initialTarget.storeId && copy)
          setTarget({
            storeId: copy.identity.storeId,
            businessDate: copy.businessDate,
          });
        if (
          copy &&
          (!initialTarget.storeId ||
            copy.identity.storeId === initialTarget.storeId) &&
          (!initialTarget.businessDate ||
            copy.businessDate === initialTarget.businessDate)
        ) {
          setWorkspace(copy);
          setAccessAllowed(true);
        }
      } catch (cause) {
        if (!disposed && current === sequence) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Stockage indisponible. Réessayez hors navigation privée.",
          );
        }
      } finally {
        if (!disposed && current === sequence) setLoading(false);
      }
    }

    async function initialize() {
      if (!enabled) {
        setReady(Boolean(window.indexedDB));
        setStorageWarning(
          "Version de développement : la réouverture hors connexion exige un build de production.",
        );
        return;
      }
      try {
        registration = await registerFieldWorker();
        await verifyFieldShell();
        if (disposed) return;
        setReady(true);
        registration.addEventListener("updatefound", trackUpdate);
        readUpdate();
        const persisted = await navigator.storage?.persisted?.();
        if (!disposed && !persisted)
          setStorageWarning(
            "Conservation non garantie par le navigateur. Installez l’app si possible, puis vérifiez la copie avant chaque utilisation.",
          );
      } catch (cause) {
        if (!disposed) {
          setLoading(false);
          setError(
            cause instanceof DOMException && cause.name === "SecurityError"
              ? "Stockage refusé. Utilisez un navigateur récent hors navigation privée et autorisez les données du site."
              : cause instanceof Error
                ? cause.message
                : "Installation indisponible.",
          );
        }
      }
    }
    const subscription = liveQuery(() => readPreparedWorkspace()).subscribe({
      next: () => {
        void restore();
      },
      error: () => {
        setLoading(false);
        setError(
          "Stockage local incompatible ou indisponible. Effacez la copie puis préparez-la de nouveau.",
        );
      },
    });
    void initialize();
    const reconnect = () => {
      void restore();
    };
    const tick = () => {
      setNow(Date.now());
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", reconnect);
    window.addEventListener("focus", reconnect);
    const timer = setInterval(tick, 30_000);
    return () => {
      disposed = true;
      sequence++;
      subscription.unsubscribe();
      clearInterval(timer);
      registration?.removeEventListener("updatefound", trackUpdate);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [enabled, accessCheck]);

  useEffect(() => {
    if (
      autoPrepare &&
      ready &&
      !loading &&
      connected &&
      !localBusy &&
      target.storeId &&
      target.businessDate &&
      !attemptedPreparation.current
    ) {
      attemptedPreparation.current = true;
      void prepare().finally(() => setOpeningComplete(true));
    }
    // Once per explicit opening; a failed attempt has an actionable retry, not a fetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoPrepare,
    ready,
    loading,
    connected,
    localBusy,
    target.storeId,
    target.businessDate,
  ]);

  useEffect(() => {
    if (workspace && offlineFreshness(workspace, now) === "purged") {
      void forgetPreparedWorkspace().catch(() =>
        setError(
          "Copie expirée : reconnectez-vous puis réessayez. Ne supprimez pas les données du site : elles peuvent contenir vos brouillons.",
        ),
      );
    }
  }, [workspace, now]);

  async function prepare() {
    setPending(true);
    setError(null);
    setNotice("");
    try {
      if (
        !ready ||
        !navigator.onLine ||
        !target.storeId ||
        !target.businessDate
      )
        throw new Error(
          "Ouvrez d’abord Stocks du matin avec du réseau et choisissez une date.",
        );
      if (enabled)
        await verifyFieldShell().catch((cause: unknown) => {
          setReady(false);
          throw cause;
        });
      const epoch = await preparationEpoch();
      const response = await fetch(
        `/api/stores/${target.storeId}/offline?businessDate=${target.businessDate}`,
        { cache: "no-store", signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok)
        throw new Error(
          "Préparation refusée ou indisponible. Vérifiez votre connexion et vos accès ; aucune nouvelle copie n’a été enregistrée.",
        );
      const result = preparedWorkspaceSchema.safeParse(await response.json());
      if (!result.success)
        throw new Error(
          "Préparation incomplète ou incompatible. Aucune nouvelle copie enregistrée ; réessayez.",
        );
      const copy = result.data;
      if (
        copy.identity.storeId !== target.storeId ||
        copy.businessDate !== target.businessDate ||
        offlineFreshness(copy, Date.now()) !== "ready"
      )
        throw new Error("Copie incohérente ou expirée. Réessayez.");
      const estimatedBytes = new TextEncoder().encode(
        JSON.stringify(copy),
      ).byteLength;
      const capacity = await navigator.storage?.estimate?.();
      // Reserve twice the JSON size for IndexedDB overhead and atomic replacement.
      if (
        capacity?.quota !== undefined &&
        capacity.usage !== undefined &&
        capacity.quota - capacity.usage < estimatedBytes * 2
      )
        throw new Error(
          "Espace insuffisant. Libérez du stockage puis recommencez.",
        );
      const persisted = await navigator.storage?.persist?.();
      setStorageWarning(
        persisted
          ? ""
          : "Conservation non garantie : le navigateur peut effacer cette copie. Installez l’app si possible et vérifiez-la avant de couper le réseau.",
      );
      if ((await checkAccess(copy)) !== true)
        throw new Error(
          "Accès non confirmé. Reconnectez-vous avant de préparer.",
        );
      if (enabled)
        await verifyFieldShell().catch((cause: unknown) => {
          setReady(false);
          throw cause;
        });
      await savePreparedWorkspace(copy, epoch);
      setPage(1);
      setNotice(
        "Catalogue complet enregistré sur cet appareil. Testez son ouverture en mode avion.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Échec de stockage. Libérez de l’espace puis réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  async function forget() {
    setPending(true);
    try {
      await forgetPreparedWorkspace();
      setWorkspace(null);
      setError(null);
      setNotice(
        "Copie locale effacée. Aucune donnée serveur ni aucun comptage n’a été supprimé.",
      );
    } catch {
      setError(
        "Impossible d’effacer la copie. Réessayez après réouverture ; ne supprimez pas les données du site si des brouillons sont à conserver.",
      );
    } finally {
      setPending(false);
    }
  }

  const freshness = workspace ? offlineFreshness(workspace, now) : null;
  const usable = !loading && ready && accessAllowed && freshness === "ready";
  const matches = usable
    ? workspace!.products.filter(
        (product) =>
          product.label
            .toLocaleLowerCase("fr")
            .includes(search.trim().toLocaleLowerCase("fr")) &&
          (!family || product.profile?.familyCode === family),
      )
    : [];
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  return (
    <div className="min-h-svh bg-muted/35">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <AppBrand subtitle="Stocks du matin" />
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <Store aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">
                {workspace?.storeName ?? "Comptage du matin"}
              </span>
            </span>
            <a
              href="#offline-help"
              onClick={openHelp}
              className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-muted"
              aria-label="Aide au comptage"
            >
              <CircleHelp aria-hidden="true" className="size-5" />
            </a>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className={`mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6 sm:pt-8 ${hasLocalDraft ? "pb-48" : "pb-8"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Private RSC/HTML is never cached; do not leave while local writes failed or are pending. */}
          <Link
            prefetch={false}
            aria-disabled={!connected || localBusy}
            onClick={(event) => {
              if (!connected || localBusy) {
                event.preventDefault();
                if (localBusy)
                  setError(
                    "Attendez l’enregistrement local ou résolvez son erreur avant de quitter la saisie.",
                  );
              }
            }}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground aria-disabled:opacity-60"
            href="/stores"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {connected
              ? "Retour aux magasins"
              : "Autres écrans · réseau requis"}
          </Link>
          <button
            type="button"
            aria-label={`${connected ? "Réseau détecté" : "Hors connexion"} : vérifier le retour du réseau`}
            disabled={pending}
            onClick={() => setAccessCheck((value) => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium"
          >
            {connected ? (
              <Wifi aria-hidden="true" className="size-4" />
            ) : (
              <WifiOff aria-hidden="true" className="size-4" />
            )}
            {connected ? "Réseau détecté" : "Hors connexion"}
          </button>
        </div>
        <h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <Warehouse aria-hidden="true" className="size-7 text-primary" />{" "}
          Stocks du matin
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {workspace
            ? `Relevé du ${workspace.businessDate} · Réserve, puis rayon.`
            : "Préparez le catalogue avant de commencer votre comptage."}
        </p>
        {target.storeId && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Changer de date
            </summary>
            <form
              action="/offline"
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                if (localBusy || !connected) event.preventDefault();
              }}
            >
              <input type="hidden" name="storeId" value={target.storeId} />
              <input
                type="hidden"
                name="organizationSlug"
                value={organizationSlug}
              />
              <input type="hidden" name="open" value="1" />
              <label>
                Date du comptage
                <Input
                  type="date"
                  name="businessDate"
                  key={target.businessDate}
                  defaultValue={target.businessDate}
                  required
                  disabled={localBusy || !connected}
                />
              </label>
              <Button type="submit" disabled={localBusy || !connected}>
                Ouvrir ce relevé
              </Button>
            </form>
          </details>
        )}
        {updateAvailable && (
          <p role="status" className="mt-4 rounded-xl border p-4 text-sm">
            Mise à jour disponible. Aucun rechargement automatique : fermez tous
            les onglets de l’app après l’affichage « Enregistré sur cet appareil
            », puis rouvrez-la.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && !hasLocalDraft && (
          <p role="status" className="mt-3 text-sm">
            {notice}
          </p>
        )}
        <details
          aria-labelledby="preparation-title"
          open={preparationOpen || !workspace || (!loading && !usable)}
          className="mt-4 rounded-xl border bg-card p-4"
        >
          <summary
            id="preparation-title"
            onClick={(event) => {
              event.preventDefault();
              if (usable) setPreparationOpen((open) => !open);
            }}
            className="cursor-pointer text-sm font-semibold"
          >
            <span>
              {loading
                ? "Vérification du catalogue…"
                : usable
                  ? "Catalogue prêt"
                  : "Préparer le comptage"}
            </span>
            {usable && workspace && (
              <span className="ml-2 font-normal text-muted-foreground">
                {workspace.productCount} articles · détails
              </span>
            )}
          </summary>
          <div aria-live="polite" className="mt-4 space-y-2 text-sm">
            {loading ? (
              <p>Vérification de la copie locale…</p>
            ) : workspace ? (
              <>
                <p className="font-semibold">
                  {workspace.storeName} · {workspace.businessDate}
                </p>
                <p>
                  {usable
                    ? "Disponible sur cet appareil"
                    : freshness === "ready"
                      ? "Application locale en cours de vérification ou incomplète"
                      : "Copie expirée ou horloge incohérente : préparation requise"}
                </p>
                <p>
                  {workspace.productCount} articles · données révision{" "}
                  {workspace.dataRevision}
                </p>
                <p>
                  Préparé le {formatTime(workspace.preparedAt)} · valable
                  jusqu’au {formatTime(workspace.expiresAt)}
                </p>
                <p className="text-muted-foreground">
                  Copie âgée de{" "}
                  {Math.max(
                    0,
                    Math.floor(
                      (now - Date.parse(workspace.preparedAt)) / 60_000,
                    ),
                  )}{" "}
                  min. Les quantités observées peuvent être plus anciennes.
                </p>
              </>
            ) : (
              <p>
                Aucun catalogue préparé pour ce magasin et cette date. Ouvrez
                Stocks du matin dans l’application connectée pour commencer.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={
                !ready ||
                !connected ||
                pending ||
                (localBusy && freshness === "ready") ||
                !target.storeId ||
                !target.businessDate
              }
              onClick={() => void prepare()}
            >
              <Download aria-hidden="true" />
              {pending ? "Opération en cours…" : "Préparer ce catalogue"}
            </Button>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer py-2 font-medium">
              Gérer la copie locale
            </summary>
            <p className="mb-3 text-muted-foreground">
              Une préparation remplace le catalogue de référence, jamais vos
              brouillons. Effacer cette copie ne supprime pas les saisies.
            </p>
            <Button
              variant="outline"
              disabled={pending || localBusy}
              onClick={() => void forget()}
            >
              Effacer la copie locale
            </Button>
          </details>
        </details>
        {storageWarning && (
          <p className="mt-2 text-xs text-amber-800">
            Conservation locale non garantie.{" "}
            <a className="underline" href="#offline-help" onClick={openHelp}>
              Conseils de stockage
            </a>
          </p>
        )}
        {autoPrepare && connected && !openingComplete ? (
          <p role="status" className="mt-3 text-sm">
            Ouverture du relevé…
          </p>
        ) : (
          workspace && (
            <LocalInventoryEditor
              key={`${workspace.identity.sessionBinding}:${draftScope(workspace)}`}
              workspace={workspace}
              accessible={usable}
              now={now}
              onBusyChange={setLocalBusy}
              onActiveChange={setHasLocalDraft}
              connected={connected}
            />
          )
        )}
        {usable && workspace && !hasLocalDraft && (
          <a
            href="#catalogue-title"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
          >
            Consulter les {workspace.productCount} articles
          </a>
        )}
        <details
          id="offline-help"
          className="mt-6 scroll-mt-20 rounded-xl border bg-card p-4 text-sm leading-6"
        >
          <summary className="cursor-pointer font-medium">
            Aide et détails
          </summary>
          <p className="mt-2">
            Comptez les colis en réserve, vérifiez leur colisage, puis ajoutez
            le reste en rayon. Vide signifie non compté ; saisissez 0 pour
            confirmer un stock nul.
          </p>
          <p className="mt-2">
            Vos saisies sont conservées sur cet appareil. En commençant un
            comptage, vous activez leur envoi au retour du réseau. Les anciens
            brouillons locaux demandent votre accord de reprise. Passez à
            Vérifier puis validez ce même relevé avec du réseau. Aucune commande
            n’est passée.
          </p>
          {storageWarning && (
            <p className="mt-2 text-amber-800">{storageWarning}</p>
          )}
          <p className="mt-2">
            Utilisez un appareil de confiance protégé par un code. Un seul
            catalogue de référence est préparé à la fois.
          </p>
          <p className="mt-2">
            Sur iPhone/iPad, ouvrez le site dans Safari, puis Partager → Sur
            l’écran d’accueil. Sur Android ou ordinateur, utilisez « Installer
            l’application » dans le menu du navigateur, si proposé.
          </p>
          <p className="mt-2">
            Ouvrez ensuite l’app installée avec du réseau et préparez-y le
            catalogue : le stockage peut être distinct de celui de l’onglet.
            Vérifiez en mode avion, fermez puis rouvrez l’app. L’installation ne
            garantit pas la conservation des données.
          </p>
          <p className="mt-2">
            Après expiration, reconnectez-vous et préparez à nouveau. Une
            déconnexion ou un changement de compte efface cette copie de
            lecture. La révocation distante ne peut pas être détectée
            immédiatement sans réseau. Ni première connexion, ni Copilote IA, ni
            autre écran non préparé ne sont disponibles hors ligne.
          </p>
          <p className="mt-2">
            Les brouillons de stock restent sur l’appareil et sont verrouillés
            après expiration ou changement de compte. Reconnectez-vous avec leur
            compte propriétaire et préparez le même magasin et la même date pour
            les retrouver. Les saisies non synchronisées ne sont pas
            sauvegardées sur le serveur : ne supprimez pas les données du site
            pour résoudre un problème de cache sans avoir repris votre travail.
          </p>
        </details>
        {organizationSlug && workspace && (
          <a
            href={`/${encodeURIComponent(organizationSlug)}/stores/${workspace.identity.storeId}/orders`}
            aria-disabled={!connected || localBusy}
            onClick={(event) => {
              if (!connected || localBusy) event.preventDefault();
            }}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline aria-disabled:opacity-50"
          >
            Préparer une préconisation de commande
          </a>
        )}
        {usable && workspace && !hasLocalDraft && (
          <section className="mt-8" aria-labelledby="catalogue-title">
            <h2
              id="catalogue-title"
              tabIndex={-1}
              className="text-xl font-semibold"
            >
              Catalogue préparé
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {workspace.countReference
                ? `Référence ${workspace.countReference.status === "draft" ? "brouillon" : "validée"} v${workspace.countReference.version} · révision ${workspace.countReference.revision}`
                : "Aucun comptage pour cette date. Une absence n’est pas un zéro."}
            </p>
            <div className="sticky top-16 z-10 mt-4 grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-[1fr_auto]">
              <label className="text-sm font-medium">
                Rechercher un article
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Nom du produit"
                />
              </label>
              <label className="text-sm font-medium">
                Famille
                <select
                  className="mt-1 block h-9 w-full rounded-lg border px-3"
                  value={family}
                  onChange={(e) => {
                    setFamily(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Toutes</option>
                  <option value="3400">Fruits · 3400</option>
                  <option value="3402">Légumes · 3402</option>
                </select>
              </label>
              <nav
                aria-label="Pages du catalogue"
                className="flex flex-wrap items-center gap-3 sm:col-span-2"
              >
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Précédente
                </Button>
                <span role="status" className="text-sm">
                  {matches.length} articles · page {currentPage}/{pageCount}
                </span>
                <Button
                  variant="outline"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Suivante
                </Button>
              </nav>
            </div>
            {matches.length === 0 && (
              <p className="py-6 text-sm">
                Aucun article ne correspond à votre recherche.
              </p>
            )}
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {matches
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((product) => (
                  <li
                    key={product.id}
                    data-offline-product
                    className="rounded-xl border bg-card p-4"
                  >
                    <h3 className="font-semibold">{product.label}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {product.profile
                        ? `${product.profile.familyCode} · ${product.profile.stockUnit === "piece" ? "pièce" : "kg"} · colisage ${product.profile.lastPackSize ?? "non renseigné"}`
                        : "Unité et colisage non configurés"}
                    </p>
                    <p className="mt-2 text-sm">
                      Référence réserve :{" "}
                      {product.countLine?.reserveCaseCount ?? "non comptée"}
                      {product.countLine?.reserveCaseCount != null
                        ? " colis"
                        : ""}{" "}
                      · rayon :{" "}
                      {product.countLine?.shelfQuantity ?? "non compté"}
                      {product.countLine?.shelfQuantity != null
                        ? ` ${product.countLine.stockUnit ?? ""}`
                        : ""}
                    </p>
                    {product.countLine && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Colisage du relevé :{" "}
                        {product.countLine.packSize ?? "non renseigné"}{" "}
                        {product.countLine.stockUnit ?? ""} / colis
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {product.lastStock
                        ? `Dernier stock observé : ${product.lastStock.quantity} ${product.lastStock.unit} · ${formatTime(product.lastStock.observedAt)}`
                        : "Aucun stock observé disponible"}
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
