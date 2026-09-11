import { describe, expect, it } from "vitest";
import { inventorySaveStatus } from "@/domain/offline/presentation";

const base = {
  saving: false,
  failed: false,
  syncEnabled: true,
  pendingCount: 0,
};
describe("offline stock save presentation", () => {
  it("never describes a local-only save as a remote acknowledgement", () => {
    expect(inventorySaveStatus({ ...base, syncEnabled: false })).toEqual({
      local: "Enregistré sur cet appareil · non synchronisé",
      remote: "Brouillon local uniquement",
    });
  });
  it("does not retain an old success label during a write or failure", () => {
    const acknowledged = {
      ...base,
      phase: "synchronized" as const,
      receivedAt: "2026-09-11T08:00:00Z",
    };
    expect(inventorySaveStatus({ ...acknowledged, saving: true }).local).toBe(
      "Enregistrement sur cet appareil…",
    );
    expect(
      inventorySaveStatus({ ...acknowledged, saving: true, failed: true }),
    ).toEqual({
      local: "Enregistrement local en échec",
      remote: "Envoi après enregistrement local",
    });
  });
  it("requires a receipt and no pending lines to announce synchronization", () => {
    expect(
      inventorySaveStatus({ ...base, phase: "synchronized" }).remote,
    ).not.toBe("Brouillon synchronisé");
    expect(
      inventorySaveStatus({
        ...base,
        phase: "synchronized",
        receivedAt: "2026-09-11T08:00:00Z",
        pendingCount: 1,
      }).remote,
    ).toBe("En attente de synchronisation");
    expect(
      inventorySaveStatus({
        ...base,
        phase: "synchronized",
        receivedAt: "2026-09-11T08:00:00Z",
      }).remote,
    ).toBe("Brouillon synchronisé");
  });
  it.each(["failed", "locked", "conflict", "pending", "syncing"] as const)(
    "keeps %s distinct from a successful upload",
    (phase) => {
      const result = inventorySaveStatus({
        ...base,
        phase,
        receivedAt: "2026-09-11T08:00:00Z",
      });
      expect(result.local).toBe("Enregistré sur cet appareil");
      expect(result.remote).not.toBe("Brouillon synchronisé");
    },
  );
});
