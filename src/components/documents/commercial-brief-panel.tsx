"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  briefFieldLabels,
  briefKindLabels,
  briefMatchSchema,
  briefStatusSchema,
  type BriefStatus,
  type BriefField,
} from "@/domain/commercial-briefs/schemas";
import {
  displayBriefValue,
  parseBriefEditedValue,
  validateBriefValues,
} from "@/domain/commercial-briefs/validation";

const responseSchema = z.object({
  brief: briefStatusSchema.nullable(),
  available: z.boolean(),
  canAnalyze: z.boolean(),
  canReview: z.boolean(),
  pages: z.array(
    z.object({
      page: z.number().int(),
      characters: z.number().int().nonnegative(),
    }),
  ),
  matches: z.array(briefMatchSchema),
  estimate: z
    .object({
      model: z.string(),
      reservedUsdCents: z.number().int(),
      dailyBudgetUsdCents: z.number().int(),
    })
    .nullable(),
});
type Result = z.infer<typeof responseSchema>;
type Props = { storeId: string; sourceId: string };
export function CommercialBriefPanel(props: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="w-full min-w-0 border-t pt-3">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        Brouillon commercial IA
      </Button>
      <div id={id}>{open && <BriefContent {...props} />}</div>
    </div>
  );
}

function BriefContent({ storeId, sourceId }: Props) {
  const [data, setData] = useState<Result | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [consent, setConsent] = useState(false);
  const [section, setSection] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const automaticReads = useRef(0);
  const id = useId();
  const run = useCallback(
    async (body?: unknown) => {
      const controller = lifetime.current;
      if (!controller || controller.signal.aborted || locked.current) return;
      locked.current = true;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/stores/${storeId}/attachments/documents/${sourceId}/brief`,
          {
            method: body ? "POST" : "GET",
            cache: "no-store",
            credentials: "same-origin",
            redirect: "error",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15_000),
            ]),
            ...(body
              ? {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                }
              : {}),
          },
        );
        if (!response.ok) throw new Error("unavailable");
        const result = responseSchema.parse(await response.json());
        if (
          result.brief &&
          (result.brief.sourceId !== sourceId ||
            Date.parse(result.brief.expiresAt) <= Date.now())
        )
          throw new Error("stale");
        if (!controller.signal.aborted) setData(result);
      } catch {
        if (!controller.signal.aborted) {
          setData(null); // Never keep private text after a refused/uncertain read.
          setError(
            body
              ? "Action non confirmée. Actualisez avant de recommencer ; ne renvoyez pas le PDF."
              : "Brouillon indisponible. Vérifiez votre accès et actualisez.",
          );
        }
      } finally {
        locked.current = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [storeId, sourceId],
  );
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const timer = setTimeout(() => void run(), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [run]);
  const active =
    data?.brief?.state === "queued" || data?.brief?.state === "running";
  useEffect(() => {
    if (!active || error) return;
    const check = () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        locked.current ||
        automaticReads.current >= 20
      )
        return;
      automaticReads.current++;
      void run();
    };
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [active, error, run]);
  const expiresAt = data?.brief?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    // Browser timers overflow beyond ~24 days; brief retention is 30 days.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining <= 0) {
        setData(null);
        void run();
        return;
      }
      timer = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [expiresAt, run]);
  const brief = data?.brief;
  const sections = brief?.extraction?.sections ?? [];
  const index = Math.min(section, Math.max(0, sections.length - 1));
  return (
    <section
      aria-label="Relecture du brouillon commercial"
      className="mt-3 min-w-0 space-y-4 text-sm"
    >
      <p role="status" aria-live="polite">
        {error
          ? "Statut à vérifier"
          : !data
            ? "Chargement…"
            : !brief
              ? "Aucun brouillon commercial"
              : {
                  queued: "Demande enregistrée — analyse en attente",
                  running: "Analyse en cours",
                  draft: "Brouillon à vérifier",
                  reviewed: "Transcription relue — aucune opération appliquée",
                  failed: "Analyse interrompue",
                }[brief.state]}
      </p>
      {active && (
        <p className="text-muted-foreground">
          Le traitement peut prendre quelques minutes. Vous pouvez quitter cette
          page.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {brief?.state === "failed" && (
        <p>
          L’analyse n’a pas abouti. Aucune relance payante automatique.
          Contactez un responsable avec la référence {brief.id.slice(0, 12)}.
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          automaticReads.current = 0;
          void run();
        }}
      >
        Actualiser le brouillon
      </Button>
      {data && !brief && !data.available && (
        <p>L’analyse commerciale n’est pas activée pour ce magasin.</p>
      )}
      {data && !brief && data.available && data.canAnalyze && (
        <div className="space-y-3">
          {!data.pages.length ? (
            <p>
              Extrayez d’abord le texte du PDF dans « Texte du PDF », puis
              actualisez ici.
            </p>
          ) : (
            <>
              <fieldset disabled={busy} className="space-y-2">
                <legend>Pages à analyser (12 maximum)</legend>
                <div className="flex flex-wrap gap-3">
                  {data.pages.map((p) => (
                    <label key={p.page} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={!p.characters}
                        checked={selectedPages.includes(p.page)}
                        onChange={(e) =>
                          setSelectedPages((v) =>
                            e.target.checked
                              ? [...v, p.page]
                              : v.filter((n) => n !== p.page),
                          )
                        }
                      />
                      Page {p.page}
                      {!p.characters ? " — sans texte, OCR non disponible" : ""}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-muted-foreground">
                Seul le texte des pages cochées sera envoyé à OpenAI. Aucun
                stock ni vente. Les réponses ne sont pas enregistrées via
                l’option API ; les règles de rétention du fournisseur restent
                applicables. Analyse payante, dans le budget configuré.
              </p>
              {data.estimate && (
                <p>
                  Modèle : {data.estimate.model}. Réservation estimative :{" "}
                  {data.estimate.reservedUsdCents} centimes USD ; budget
                  journalier du magasin : {data.estimate.dailyBudgetUsdCents}{" "}
                  centimes USD.
                </p>
              )}
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                J’autorise l’analyse de ces pages par OpenAI.
              </label>
              <Button
                disabled={
                  busy ||
                  !consent ||
                  !selectedPages.length ||
                  selectedPages.length > 12
                }
                onClick={() =>
                  void run({
                    action: "analyze",
                    consent: true,
                    pages: selectedPages,
                  })
                }
              >
                Préparer le brouillon commercial
              </Button>
            </>
          )}
        </div>
      )}
      {brief?.extraction && (
        <>
          <p className="text-muted-foreground">
            {brief.reviews.length} / {sections.length} éléments relus. L’IA peut
            se tromper : confirmer valide la transcription, pas son application
            au magasin. Les correspondances au catalogue ne sont pas encore
            validées.
          </p>
          {!sections.length && (
            <p>
              Aucun élément commercial identifié dans les pages sélectionnées.
              Vérifiez le PDF original ; ce résultat ne prouve pas l’absence
              d’offres.
            </p>
          )}
          {sections.length > 0 && (
            <>
              <label htmlFor={id}>Élément à vérifier</label>
              <select
                id={id}
                className="w-full rounded-md border bg-background p-2"
                value={index}
                onChange={(e) => setSection(Number(e.target.value))}
              >
                {sections.map((s, i) => (
                  <option key={i} value={i}>
                    {i + 1}.{" "}
                    {s.fields.find((f) => f.key === "product_label")?.value ??
                      s.fields.find((f) => f.key === "title")?.value ??
                      briefKindLabels[s.kind]}
                    {brief.reviews.some((r) => r.section === i)
                      ? " — relu"
                      : ""}
                  </option>
                ))}
              </select>
              <p>
                Catalogue :{" "}
                {data!.matches.find((m) => m.section === index)?.product
                  ?.label ?? "aucune correspondance unique"}
                . Suggestion uniquement, aucune association enregistrée.
              </p>
              <SectionReview
                key={`${brief.id}/${brief.revision}/${index}`}
                brief={brief}
                index={index}
                canReview={data!.canReview}
                busy={busy}
                submit={(values) =>
                  run({
                    action: "review",
                    review: {
                      expectedRevision: brief.revision,
                      section: index,
                      ...values,
                    },
                  })
                }
              />
            </>
          )}
          <details>
            <summary>Traçabilité</summary>
            <p>
              Modèle : {brief.model} · Version : {brief.policyVersion}
            </p>
            <p>
              Confiance : appréciation de transcription de l’IA, non calibrée
              statistiquement.
            </p>
            <p>
              Conservation jusqu’au{" "}
              {new Date(brief.expiresAt).toLocaleDateString("fr-FR")}. Le PDF
              original reste distinct.
            </p>
            {brief.usage && (
              <p>
                {brief.usage.inputTokens} tokens en entrée ·{" "}
                {brief.usage.outputTokens} en sortie · coût estimé :{" "}
                {brief.usage.estimatedUsdCents} centimes USD.
              </p>
            )}
          </details>
        </>
      )}
    </section>
  );
}

function SectionReview({
  brief,
  index,
  canReview,
  busy,
  submit,
}: {
  brief: BriefStatus;
  index: number;
  canReview: boolean;
  busy: boolean;
  submit: (value: {
    decision: "confirmed" | "excluded";
    values: Pick<BriefField, "key" | "value">[];
  }) => Promise<void>;
}) {
  const section = brief.extraction!.sections[index]!;
  const reviewed = brief.reviews.find((r) => r.section === index);
  const [values, setValues] = useState(() =>
    section.fields.map((f, i) =>
      displayBriefValue({
        key: f.key,
        value:
          reviewed?.decision === "confirmed"
            ? reviewed.values[i]!.value
            : f.value,
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const disabled = busy || !canReview || Boolean(reviewed);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const fields = section.fields.map((f, i) => ({
            key: f.key,
            value: parseBriefEditedValue(f.key, values[i]!),
          }));
          validateBriefValues(fields);
          await submit({ decision: "confirmed", values: fields });
        } catch {
          setError(
            "Vérifiez les valeurs : dates complètes, prix en euros et nature du prix. Laissez vide ce qui reste inconnu.",
          );
        }
      }}
    >
      <h3 className="font-medium">{briefKindLabels[section.kind]}</h3>
      <blockquote className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">
        Page {section.evidence.page} — {section.evidence.excerpt}
      </blockquote>
      {reviewed && (
        <p role="status">
          {reviewed.decision === "confirmed"
            ? "Transcription confirmée"
            : "Élément exclu"}
        </p>
      )}
      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-1">
        {section.fields.map((field, i) => (
          <div key={field.key} className="space-y-1">
            <label htmlFor={`${id}-${i}`} className="font-medium">
              {briefFieldLabels[field.key]}
            </label>
            {field.key === "price_qualifier" ? (
              <select
                id={`${id}-${i}`}
                className="w-full rounded-md border bg-background p-2"
                value={values[i]}
                disabled={disabled}
                onChange={(e) =>
                  setValues((v) =>
                    v.map((value, at) => (at === i ? e.target.value : value)),
                  )
                }
              >
                <option value="">Inconnu</option>
                <option value="exact">Prix exact</option>
                <option value="starting_from">À partir de</option>
                <option value="less_than">Moins de</option>
                <option value="maximum">Prix maximum</option>
              </select>
            ) : (
              <Input
                id={`${id}-${i}`}
                inputMode={
                  field.key.endsWith("_cents") || field.key === "margin_ratio"
                    ? "decimal"
                    : undefined
                }
                value={values[i]}
                disabled={disabled}
                placeholder="Inconnu"
                onChange={(e) =>
                  setValues((v) =>
                    v.map((value, at) => (at === i ? e.target.value : value)),
                  )
                }
              />
            )}
            <details className="text-xs text-muted-foreground">
              <summary>Source p. {field.evidence.page}</summary>
              <p>{field.evidence.excerpt}</p>
            </details>
            {(field.confidence === "low" ||
              field.confidence === "unknown" ||
              field.value === null) && (
              <p className="text-xs">À vérifier en priorité</p>
            )}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!reviewed && canReview && (
        <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-md border bg-background p-2">
          <Button type="submit" disabled={disabled}>
            Confirmer la transcription
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => void submit({ decision: "excluded", values: [] })}
          >
            Exclure cet élément
          </Button>
        </div>
      )}
    </form>
  );
}
