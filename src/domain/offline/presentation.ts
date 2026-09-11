import type { SyncRecord } from "./sync";

/** Presentation only: connectivity is deliberately not evidence of a save. */
export function inventorySaveStatus(input: {
  saving: boolean;
  failed: boolean;
  syncEnabled: boolean;
  phase?: SyncRecord["phase"];
  pendingCount: number;
  receivedAt?: string | null;
}) {
  const local = input.failed
    ? "Enregistrement local en échec"
    : input.saving
      ? "Enregistrement sur cet appareil…"
      : input.syncEnabled
        ? "Enregistré sur cet appareil"
        : "Enregistré sur cet appareil · non synchronisé";
  if (!input.syncEnabled)
    return { local, remote: "Brouillon local uniquement" };
  if (input.failed || input.saving)
    return { local, remote: "Envoi après enregistrement local" };
  const labels = {
    pending: "En attente de synchronisation",
    syncing: "Synchronisation en cours",
    failed: "Synchronisation en échec",
    conflict: "Conflit à résoudre",
    locked: "Synchronisation verrouillée",
  };
  if (input.phase && input.phase !== "synchronized")
    return { local, remote: labels[input.phase] };
  if (input.pendingCount > 0)
    return { local, remote: "En attente de synchronisation" };
  return {
    local,
    remote:
      input.phase === "synchronized" && input.receivedAt
        ? "Brouillon synchronisé"
        : input.phase === "synchronized"
          ? "Aucune nouvelle saisie à envoyer"
          : "Vérification de la synchronisation…",
  };
}
