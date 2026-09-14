"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CampaignsManagement } from "@/app/campaigns/page";

export default function CampaignMainPage() {
  const params = useParams<{ id: string }>();
  const campaignId = Number(params.id);

  return (
    <AppShell title="Campaigns">
      {() => (
        <CampaignsManagement
          detailMode
          initialCampaignId={Number.isFinite(campaignId) ? campaignId : undefined}
        />
      )}
    </AppShell>
  );
}
