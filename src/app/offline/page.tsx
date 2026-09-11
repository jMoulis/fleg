import type { Metadata } from "next";
import { OfflineWorkspace } from "@/components/offline/offline-workspace";

export const metadata: Metadata = {
  title: "Stocks du matin — F&L Cockpit",
  robots: { index: false, follow: false },
};
// Public, static shell only. Never read cookies, headers or business data here.
export const dynamic = "force-static";

export default function OfflinePage() {
  return <OfflineWorkspace enabled={process.env.NODE_ENV === "production"} />;
}
