"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { InventoryCount } from "@/domain/inventory/schemas";
import type { LocalInventoryDraft } from "@/domain/offline/inventory-draft";
import type { PreparedWorkspace } from "@/domain/offline/schemas";
import { readLocalDraft } from "@/lib/offline/inventory-drafts";
import {
  prepareCountCommit,
  prepareCountCorrection,
  readCountForReview,
  reopenRejectedCommit,
  sendCountCommit,
  sendCountCorrection,
} from "@/lib/offline/count-lifecycle";

export function CountWorkflowActions({
  workspace,
  draft,
  disabled,
  connected,
  reviewRequest,
  next,
  onBusyChange,
  onSettled,
}: {
  workspace: PreparedWorkspace;
  draft: LocalInventoryDraft;
  disabled: boolean;
  connected: boolean;
  reviewRequest: number;
  next: () => void;
  onBusyChange: (busy: boolean) => void;
  onSettled: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{
    count: InventoryCount;
    signature: string;
  } | null>(null);
  const requested = useRef(0);
  const running = useRef(false);
  const phase = draft.lifecycle?.phase ?? "editing";
  const reviewing = draft.view.area === "review";
  const signature = JSON.stringify(draft.lines);

  async function act(action: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Action non confirmée. Réessayez avec du réseau.",
      );
    } finally {
      // Publish the committed IDB revision to the editor before enabling input.
      // liveQuery notifications alone can arrive after the action button unlocks.
      try {
        await onSettled();
      } catch {
        setError(
          "Relisez le relevé avec le compte propriétaire avant de poursuivre.",
        );
      }
      running.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function inspect() {
    const count = await readCountForReview(workspace);
    const current = await readLocalDraft(workspace);
    if (current) setReview({ count, signature: JSON.stringify(current.lines) });
  }
  useEffect(() => {
    if (
      reviewing &&
      reviewRequest > requested.current &&
      connected &&
      !disabled &&
      !busy &&
      phase === "editing"
    ) {
      requested.current = reviewRequest;
      void act(inspect);
    }
    // Only this tab's explicit navigation triggers a review, never a view change
    // broadcast from another tab. Keep one operation in flight per action panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, reviewRequest, connected, disabled, busy, phase]);

  const locked = disabled || busy || !connected;
  let action;
  if (phase === "committing") {
    action =
      draft.lifecycle?.phase === "committing" && draft.lifecycle.rejected ? (
        <Button
          disabled={locked}
          onClick={() =>
            void act(async () => {
              await reopenRejectedCommit(workspace);
              setReview(null);
            })
          }
        >
          Revenir à la vérification
        </Button>
      ) : (
        <Button
          disabled={locked}
          onClick={() => void act(() => sendCountCommit(workspace))}
        >
          Vérifier la validation
        </Button>
      );
  } else if (phase === "correcting") {
    action = (
      <Button
        disabled={locked}
        onClick={() => void act(() => sendCountCorrection(workspace))}
      >
        Reprendre la correction
      </Button>
    );
  } else if (phase === "committed" || phase === "server_committed") {
    action = (
      <Button
        disabled={locked}
        onClick={() =>
          void act(async () => {
            await prepareCountCorrection(workspace);
            await sendCountCorrection(workspace);
          })
        }
      >
        {phase === "server_committed"
          ? "Corriger et comparer mes saisies"
          : "Corriger ce relevé"}
      </Button>
    );
  } else if (!reviewing) {
    action = (
      <Button disabled={disabled || busy} onClick={next}>
        {draft.view.area === "configuration"
          ? "Passer en réserve"
          : draft.view.area === "reserve"
            ? "Passer en rayon"
            : "Vérifier le comptage"}
      </Button>
    );
  } else if (
    !review ||
    review.signature !== signature ||
    review.count.id !== draft.serverCountId ||
    review.count.status !== "draft"
  ) {
    action = (
      <Button disabled={locked} onClick={() => void act(inspect)}>
        Vérifier les données reçues
      </Button>
    );
  } else {
    action = (
      <Button
        disabled={locked}
        onClick={() =>
          void act(async () => {
            await prepareCountCommit(workspace, draft.revision, review.count);
            await sendCountCommit(workspace);
          })
        }
      >
        Valider le comptage
      </Button>
    );
  }
  return (
    <div className="max-w-64 space-y-1 text-xs">
      {action}
      {busy && <p role="status">Vérification en cours…</p>}
      {!connected && (reviewing || phase !== "editing") && (
        <p>Connexion requise pour valider ou corriger.</p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
