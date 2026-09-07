"use client";

import { useMemo, useState } from "react";
import {
  CircleAlert,
  LoaderCircle,
  PackageCheck,
  Save,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiErrorSchema } from "@/domain/api/schemas";
import type { AllocationProduct } from "@/domain/space/allocation-schemas";
import {
  fixtureTypeLabels,
  productSpacePolicySetResponseSchema,
  productSpacePolicySetUpdateInputSchema,
  type ProductSpacePolicy,
  type ProductSpacePolicySet,
} from "@/domain/space/product-space-policy-schemas";
import type { FixtureType } from "@/domain/space/schemas";
import { cn } from "@/lib/utils";

interface ProductSpacePolicyEditorProps {
  storeId: string;
  products: AllocationProduct[];
  fixtureTypes: FixtureType[];
  initialPolicySet: ProductSpacePolicySet;
  canWrite: boolean;
  onSaved: (policySet: ProductSpacePolicySet) => void;
}

function defaultPolicy(productId: string): ProductSpacePolicy {
  return {
    productId,
    mustStock: false,
    suitability: "unknown",
    allowedFixtureTypes: [],
  };
}

function normalizePolicies(policies: ProductSpacePolicy[]) {
  return policies
    .filter((policy) => policy.mustStock || policy.suitability === "restricted")
    .sort((first, second) => first.productId.localeCompare(second.productId));
}

export function ProductSpacePolicyEditor({
  storeId,
  products,
  fixtureTypes,
  initialPolicySet,
  canWrite,
  onSaved,
}: ProductSpacePolicyEditorProps) {
  const [savedPolicySet, setSavedPolicySet] = useState(initialPolicySet);
  const [policies, setPolicies] = useState(initialPolicySet.policies);
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id ?? "",
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const selectedPolicy =
    policies.find((policy) => policy.productId === selectedProductId) ??
    defaultPolicy(selectedProductId);
  const normalizedPolicies = normalizePolicies(policies);
  const dirty =
    JSON.stringify(normalizedPolicies) !==
    JSON.stringify(normalizePolicies(savedPolicySet.policies));

  function updateSelectedPolicy(
    update: Partial<Omit<ProductSpacePolicy, "productId">>,
  ) {
    if (!selectedProductId) return;
    const next = { ...selectedPolicy, ...update };
    setPolicies((current) => [
      ...current.filter((policy) => policy.productId !== selectedProductId),
      next,
    ]);
    setError(null);
    setNotice(null);
  }

  function updateSuitability(value: "unknown" | "restricted") {
    updateSelectedPolicy({
      suitability: value,
      allowedFixtureTypes:
        value === "unknown"
          ? []
          : selectedPolicy.allowedFixtureTypes.length > 0
            ? selectedPolicy.allowedFixtureTypes
            : fixtureTypes,
    });
  }

  function toggleFixtureType(fixtureType: FixtureType) {
    const selected = selectedPolicy.allowedFixtureTypes.includes(fixtureType);
    updateSelectedPolicy({
      suitability: "restricted",
      allowedFixtureTypes: selected
        ? selectedPolicy.allowedFixtureTypes.filter(
            (candidate) => candidate !== fixtureType,
          )
        : [...selectedPolicy.allowedFixtureTypes, fixtureType],
    });
  }

  function clearSelectedPolicy() {
    setPolicies((current) =>
      current.filter((policy) => policy.productId !== selectedProductId),
    );
    setError(null);
    setNotice(null);
  }

  async function savePolicies() {
    setError(null);
    setNotice(null);
    const parsed = productSpacePolicySetUpdateInputSchema.safeParse({
      idempotencyKey,
      basedOnRevision: savedPolicySet.revision,
      policies: normalizedPolicies,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Les contraintes produits sont invalides.",
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/stores/${storeId}/space-policies`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(body);
        throw new Error(
          apiError.success
            ? apiError.data.message
            : "Les contraintes produits n’ont pas pu être enregistrées.",
        );
      }

      const result = productSpacePolicySetResponseSchema.parse(body);
      setSavedPolicySet(result.policySet);
      setPolicies(result.policySet.policies);
      setIdempotencyKey(crypto.randomUUID());
      setNotice(`Contraintes enregistrées · révision ${result.policySet.revision}.`);
      onSaved(result.policySet);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Les contraintes produits n’ont pas pu être enregistrées.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <PackageCheck aria-hidden="true" className="size-5 text-primary" />
            Contraintes produits
          </CardTitle>
          <Badge variant="secondary">Révision {savedPolicySet.revision}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Le stock obligatoire et les mobiliers autorisés sont enregistrés côté
          serveur et audités avant d’influencer une proposition.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Contraintes non enregistrées</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert role="status">
            <AlertTitle>Contraintes à jour</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-2">
            <p className="text-sm font-medium">Produit à configurer</p>
            <Select
              disabled={!canWrite || products.length === 0}
              onValueChange={(value) => {
                setSelectedProductId(value ?? "");
                setError(null);
                setNotice(null);
              }}
              value={selectedProductId}
            >
              <SelectTrigger
                aria-label="Produit à configurer"
                className="w-full"
              >
                <SelectValue placeholder="Choisir un produit">
                  {productById.get(selectedProductId)?.label ??
                    "Choisir un produit"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProductId ? (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  checked={selectedPolicy.mustStock}
                  className="mt-0.5 size-4 accent-primary"
                  disabled={!canWrite}
                  onChange={(event) =>
                    updateSelectedPolicy({ mustStock: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium">Stock obligatoire</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Le produit doit apparaître au moins une fois dans le plan.
                  </span>
                </span>
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium">Compatibilité mobilier</p>
                <Select
                  disabled={!canWrite}
                  onValueChange={(value) =>
                    updateSuitability(
                      value === "restricted" ? "restricted" : "unknown",
                    )
                  }
                  value={selectedPolicy.suitability}
                >
                  <SelectTrigger
                    aria-label="Compatibilité mobilier"
                    className="w-full sm:w-72"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Non renseignée</SelectItem>
                    <SelectItem value="restricted">
                      Mobiliers autorisés
                    </SelectItem>
                  </SelectContent>
                </Select>
                {selectedPolicy.suitability === "restricted" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {fixtureTypes.map((fixtureType) => {
                      const selected =
                        selectedPolicy.allowedFixtureTypes.includes(fixtureType);
                      return (
                        <Button
                          aria-pressed={selected}
                          className={cn(
                            selected &&
                              "border-primary bg-primary/10 text-primary",
                          )}
                          disabled={!canWrite}
                          key={fixtureType}
                          onClick={() => toggleFixtureType(fixtureType)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {fixtureTypeLabels[fixtureType]}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <Button
                disabled={!canWrite || !policies.some((policy) => policy.productId === selectedProductId)}
                onClick={clearSelectedPolicy}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
                Effacer la règle
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {normalizedPolicies.length} produit(s) configuré(s)
            {dirty ? " · modifications non enregistrées" : " · à jour"}
          </p>
          <Button
            disabled={!canWrite || !dirty || saving}
            onClick={savePolicies}
            type="button"
          >
            {saving ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Enregistrer les contraintes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
