import type { ObjectId } from "mongodb";

export enum StoreRole {
  OrganizationAdmin = "organization_admin",
  StoreDirector = "store_director",
  DepartmentManager = "department_manager",
  Employee = "employee",
  Viewer = "viewer",
}
export enum StorePermission {
  StoresRead="stores.read", StoresManage="stores.manage",
  AnalyticsRead="analytics.read", AnalyticsCompareStores="analytics.compare_stores",
  ImportsCreate="imports.create", ImportsCommit="imports.commit",
  TargetsWrite="targets.write", LayoutsWrite="layouts.write",
  AllocationsWrite="allocations.write", MarkdownWrite="markdown.write",
  RecommendationsApprove="recommendations.approve", TgPublish="tg.publish",
  SettingsWrite="settings.write", AiUse="ai.use",
  ExperimentsRead="experiments.read", ExperimentsWrite="experiments.write",
  ExperimentsStart="experiments.start", ExperimentsConclude="experiments.conclude",
  ExperimentsCompareStores="experiments.compare_stores",
}
export enum ProductDecision {
  Push="push", Maintain="maintain", Reduce="reduce",
  ReviewMargin="review_margin", ReviewWaste="review_waste",
  ReviewSpace="review_space", DelistCandidate="delist_candidate",
  TrafficProtect="traffic_protect",
}
export enum AbcClass { A="A", B="B", C="C" }
export enum XyzClass { X="X", Y="Y", Z="Z" }
export enum FixtureType { Island="island", Endcap="endcap", Wall="wall", Bin="bin" }
export enum ExperimentStatus { Draft="draft", Planned="planned", Running="running", AwaitingData="awaiting_data", Analyzed="analyzed", Concluded="concluded", Archived="archived", Cancelled="cancelled" }
export enum ExperimentType { TgPlacement="tg_placement", SpaceChange="space_change", LayoutChange="layout_change", PriceChange="price_change", Promotion="promotion", Assortment="assortment", Presentation="presentation", Custom="custom" }
export enum ExperimentVerdict { Winner="winner", Promising="promising", Neutral="neutral", Loser="loser", Inconclusive="inconclusive" }
export enum ExperimentDecision { RollOut="roll_out", Repeat="repeat", ModifyAndRepeat="modify_and_repeat", Stop="stop", NoAction="no_action" }
export enum BaselineMethod { PriorComparablePeriods="prior_comparable_periods", PriorYear="prior_year", InternalCategoryControl="internal_category_control", ControlStore="control_store", DifferenceInDifferences="difference_in_differences" }
export type EvidenceQuality = "high"|"medium"|"low";
export type ExperimentMetric = "revenue"|"quantity"|"gross_margin_cents"|"gross_margin_rate"|"markdown_cents"|"revenue_per_effective_meter"|"margin_per_effective_meter"|"department_revenue"|"family_revenue";

export interface Store {
  _id:ObjectId; organizationId:string; code:string; name:string;
  timezone:string; currency:"EUR"; active:boolean; createdAt:Date; updatedAt:Date;
}
export interface StoreMembership {
  _id:ObjectId; organizationId:string; storeId:ObjectId; userId:string;
  role:StoreRole; permissions:StorePermission[]; active:boolean;
}
export interface Department {
  _id:ObjectId; organizationId:string; storeId:ObjectId;
  type:"fruit_vegetable"; name:string; active:boolean;
}
export interface Product {
  _id:ObjectId; organizationId:string; storeId:ObjectId; departmentId:ObjectId;
  name:string; normalizedLabel:string; family?:string; subfamily?:string;
  unitType?:"kg"|"unit"|"pack"; mustStock:boolean; trafficProduct:boolean; active:boolean;
}
export interface ProductAlias {
  _id:ObjectId; organizationId:string; storeId:ObjectId; productId:ObjectId;
  source:"mercalys"; externalKey:string; sourceLabel:string;
}
export interface SalesFact {
  _id:ObjectId; organizationId:string; storeId:ObjectId; departmentId:ObjectId;
  productId:ObjectId; source:"mercalys"; sourceLabel:string; periodKey:string;
  date?:Date; quantity:number; revenueCents:number; grossMarginCents:number;
  grossMarginRate:number; importJobId:ObjectId;
}
export interface MarkdownFact {
  _id:ObjectId; organizationId:string; storeId:ObjectId; departmentId:ObjectId;
  productId:ObjectId; date:Date; quantity?:number; economicCostCents:number;
  reason:string; note?:string;
}
export interface Fixture {
  id:string; type:FixtureType; name:string; xM:number; yM:number;
  widthM:number; depthM:number; rotationDeg:number; faces:SellingFace[];
}
export interface SellingFace {
  id:string; fixtureId:string; name:string; widthM:number;
  trafficWeight:number; visibilityWeight:number; shelves:Shelf[];
}
export interface Shelf {
  id:string; faceId:string; level:"main"|"upper"|"lower";
  widthM:number; depthM:number; shelfWeight:number;
}
export interface LayoutVersion {
  _id:ObjectId; organizationId:string; storeId:ObjectId; departmentId:ObjectId;
  version:number; effectiveFrom:Date; name:string; fixtures:Fixture[];
}
export interface DisplayAllocation {
  _id:ObjectId; organizationId:string; storeId:ObjectId; departmentId:ObjectId;
  layoutVersionId:ObjectId; productId:ObjectId; shelfId:string;
  facingWidthM:number; locked:boolean; startsAt:Date; endsAt?:Date;
}
export interface AuthorizedStoreContext {
  userId:string; organizationId:string; storeId:string;
  role:StoreRole; permissions:StorePermission[];
}

export interface Experiment {
  _id:ObjectId; organizationId:string; storeId:ObjectId; departmentId:ObjectId;
  title:string; hypothesis:string; type:ExperimentType; status:ExperimentStatus; ownerUserId:string;
  productIds:ObjectId[]; family?:string; treatmentPlan:Record<string,unknown>; treatmentActual?:Record<string,unknown>;
  plannedStartAt:Date; plannedEndAt:Date; actualStartAt?:Date; actualEndAt?:Date;
  primaryMetric:ExperimentMetric; secondaryMetrics:ExperimentMetric[]; guardrailMetrics:ExperimentMetric[];
  baselineConfig:{method:BaselineMethod; comparablePeriods?:number; controlStoreIds?:ObjectId[]};
  expectedRelativeEffect?:number; explicitCostsCents?:number; confounders:string[];
  linkedCommercialEventId?:ObjectId; linkedRecommendationId?:ObjectId;
  createdAt:Date; updatedAt:Date;
}
export interface ExperimentMetricEvaluation {
  metric:ExperimentMetric; actual:number; expectedWithoutTest:number|null;
  absoluteUplift:number|null; relativeUplift:number|null; baselineMethod:BaselineMethod;
  quality:EvidenceQuality; warnings:string[];
}
export interface ExperimentAnalysis {
  _id:ObjectId; organizationId:string; storeId:ObjectId; experimentId:ObjectId;
  analysisVersion:number; engineVersion:string; analyzedAt:Date; evidenceQuality:EvidenceQuality;
  metrics:ExperimentMetricEvaluation[]; incrementalGrossMarginCents?:number; netIncrementalValueCents?:number;
  warnings:string[];
}
export interface ExperimentConclusion {
  _id:ObjectId; organizationId:string; storeId:ObjectId; experimentId:ObjectId; analysisId:ObjectId;
  systemSuggestedVerdict:ExperimentVerdict; managerVerdict:ExperimentVerdict;
  managerDecision:ExperimentDecision; rationale:string; reusableTags:string[];
  actorUserId:string; concludedAt:Date;
}
