"use client";

import { liveQuery } from "dexie";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, Leaf, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  offlineFreshness,
  offlineIdentitySchema,
  preparedWorkspaceSchema,
  sameOfflineIdentity,
  type PreparedWorkspace,
} from "@/domain/offline/schemas";
import { inventoryWorkspaceQuerySchema } from "@/domain/inventory/schemas";
import { storeIdSchema } from "@/domain/stores/schemas";
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
  return sameOfflineIdentity(
    workspace.identity,
    offlineIdentitySchema.parse(await response.json()),
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
      setWorkspace(null);
      setConnected(navigator.onLine);
      setNow(Date.now());
      setTarget(initialTarget);
      try {
        const copy = await readPreparedWorkspace();
        if (disposed || current !== sequence) return;
        if (copy && offlineFreshness(copy, Date.now()) === "purged") {
          await forgetPreparedWorkspace();
          return;
        }
        if (copy && navigator.onLine) {
          const access = await checkAccess(copy);
          if (disposed || current !== sequence) return;
          if (access === false) {
            await forgetPreparedWorkspace();
            if (!disposed)
              setError(
                "Session ou accès modifié : préparez à nouveau le magasin après connexion.",
              );
            return;
          }
          if (access === null && !disposed && current === sequence)
            setConnected(false);
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
        )
          setWorkspace(copy);
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
        setError(
          "La préparation hors connexion nécessite une version de production (npm run build, puis npm start).",
        );
        setLoading(false);
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
  }, [enabled]);

  useEffect(() => {
    if (workspace && offlineFreshness(workspace, now) === "purged") {
      void forgetPreparedWorkspace().catch(() =>
        setError(
          "Copie expirée : effacez les données du site dans les réglages du navigateur.",
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
        "Impossible d’effacer la copie. Utilisez les réglages de stockage du navigateur.",
      );
    } finally {
      setPending(false);
    }
  }

  const freshness = workspace ? offlineFreshness(workspace, now) : null;
  const usable = !loading && ready && freshness === "ready";
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
    <main
      id="main-content"
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-primary">
          <Leaf aria-hidden="true" className="size-5" /> F&amp;L Cockpit
        </p>
        {/* Full navigation: authenticated RSC/HTML must never be served by the offline cache. */}
        <Link
          prefetch={false}
          className="text-sm font-medium underline"
          href="/stores"
        >
          Ouvrir l’application connectée
        </Link>
      </header>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Espace hors connexion
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Votre catalogue et votre relevé de référence, à consulter en réserve.
        Cette première version est en lecture seule : la saisie et la validation
        des stocks restent connectées.
      </p>
      <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <WifiOff aria-hidden="true" className="size-4" />
        {connected ? "Réseau détecté" : "Sans réseau · copie locale uniquement"}
      </p>
      {usable && workspace && (
        <a
          href="#catalogue-title"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground"
        >
          Consulter les {workspace.productCount} articles
        </a>
      )}
      {updateAvailable && (
        <p role="status" className="mt-4 rounded-xl border p-4 text-sm">
          Mise à jour disponible. Aucun rechargement automatique : fermez tous
          les onglets de l’app après avoir enregistré votre travail connecté,
          puis rouvrez-la.
        </p>
      )}
      <section
        aria-labelledby="preparation-title"
        className="mt-6 rounded-2xl border bg-card p-4 sm:p-6"
      >
        <h2 id="preparation-title" className="text-lg font-semibold">
          Préparer avant de couper le réseau
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Un seul magasin et une seule date sont conservés sur cet appareil. Une
          nouvelle préparation remplace la copie précédente. Utilisez uniquement
          un appareil de confiance, protégé par un code.
        </p>
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
                  ? "Prêt pour la consultation hors connexion"
                  : freshness === "ready"
                    ? "Application locale en cours de vérification ou incomplète"
                    : "Copie expirée ou horloge incohérente : préparation requise"}
              </p>
              <p>
                {workspace.productCount} articles · données révision{" "}
                {workspace.dataRevision}
              </p>
              <p>
                Préparé le {formatTime(workspace.preparedAt)} · valable jusqu’au{" "}
                {formatTime(workspace.expiresAt)}
              </p>
              <p className="text-muted-foreground">
                Copie âgée de{" "}
                {Math.max(
                  0,
                  Math.floor((now - Date.parse(workspace.preparedAt)) / 60_000),
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
          {notice && <p>{notice}</p>}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {storageWarning && (
          <p className="mt-3 text-sm leading-6 text-amber-800">
            {storageWarning}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            size="lg"
            disabled={
              !ready ||
              !connected ||
              pending ||
              !target.storeId ||
              !target.businessDate
            }
            onClick={() => void prepare()}
          >
            <Download aria-hidden="true" />
            {pending ? "Opération en cours…" : "Préparer ce catalogue"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => void forget()}
          >
            Effacer la copie locale
          </Button>
          {!connected && (
            <Button
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => window.location.reload()}
            >
              Vérifier le retour du réseau
            </Button>
          )}
        </div>
        <details className="mt-4 text-sm leading-6">
          <summary className="cursor-pointer font-medium">
            Installer l’application et vérifier le stockage
          </summary>
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
        </details>
      </section>
      {usable && workspace && (
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
          <div className="sticky top-0 z-10 mt-4 grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-[1fr_auto]">
            <p className="text-sm font-semibold sm:col-span-2">
              Copie locale · {workspace.storeName} · {workspace.businessDate}
            </p>
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
                    · rayon : {product.countLine?.shelfQuantity ?? "non compté"}
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
  );
}
