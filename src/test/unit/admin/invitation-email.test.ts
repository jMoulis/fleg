import { describe, expect, it, vi } from "vitest";

import {
  deliverOrganizationInvitationEmail,
  InvitationEmailDeliveryError,
  renderOrganizationInvitationEmail,
} from "@/domain/admin/invitation-email";

const input = {
  invitationId: "invitation-123",
  recipientEmail: "invitee@example.com",
  organizationName: "Réseau <F&L>",
  inviterName: "Julie <Admin>",
  inviterEmail: "julie@example.com",
  role: "member",
  expiresAt: "2026-09-08T12:00:00.000Z",
  acceptUrl: "https://cockpit.example.com/invitations/invitation-123",
};

const environment = {
  INVITATION_EMAIL_PROVIDER: "resend" as const,
  RESEND_API_KEY: "re_test_key",
  INVITATION_EMAIL_FROM: "F&L Cockpit <invitation@example.com>",
  INVITATION_EMAIL_REPLY_TO: "support@example.com",
  INVITATION_EMAIL_TIMEOUT_MS: 5_000,
};

describe("organization invitation email", () => {
  it("renders a French text alternative and escapes dynamic HTML", () => {
    const rendered = renderOrganizationInvitationEmail(input);

    expect(rendered.subject).toBe("Invitation à rejoindre Réseau <F&L>");
    expect(rendered.text).toContain(input.acceptUrl);
    expect(rendered.html).toContain("Réseau &lt;F&amp;L&gt;");
    expect(rendered.html).not.toContain("Julie <Admin>");
  });

  it("sends a bounded idempotent Resend request", async () => {
    const fetcher = vi.fn(
      async (...request: [string | URL | Request, RequestInit?]) => {
        void request;
        return Response.json({ id: "message-123" }, { status: 200 });
      },
    );

    const result = await deliverOrganizationInvitationEmail(input, {
      environment,
      fetcher,
    });

    expect(result).toMatchObject({
      provider: "resend",
      providerMessageId: "message-123",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request?.headers).toMatchObject({
      "Idempotency-Key":
        "organization-invitation/invitation-123/1788868800000",
      "User-Agent": "fleg-cockpit/0.1.0",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      to: ["invitee@example.com"],
      reply_to: "support@example.com",
    });
  });

  it("rejects malformed provider responses without exposing their body", async () => {
    const fetcher = vi.fn(
      async (...request: [string | URL | Request, RequestInit?]) => {
        void request;
        return Response.json(
          { message: "provider details that must stay private" },
          { status: 422 },
        );
      },
    );

    await expect(
      deliverOrganizationInvitationEmail(input, { environment, fetcher }),
    ).rejects.toEqual(expect.any(InvitationEmailDeliveryError));
  });
});
