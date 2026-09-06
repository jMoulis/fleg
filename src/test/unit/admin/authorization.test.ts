import { describe, expect, it } from "vitest";

import {
  authorizeOrganizationAdmin,
  OrganizationAdminAccessDeniedError,
} from "@/domain/admin/authorization";

const organization = {
  id: "org-a",
  slug: "org-a",
  name: "Organisation A",
};

describe("organization admin authorization", () => {
  it.each(["owner", "admin"])("authorizes an organization %s", (role) => {
    expect(
      authorizeOrganizationAdmin({
        userId: "user-a",
        organization,
        membership: {
          userId: "user-a",
          organizationId: "org-a",
          role,
        },
      }),
    ).toMatchObject({ organizationId: "org-a", role });
  });

  it("rejects a regular organization member", () => {
    expect(() =>
      authorizeOrganizationAdmin({
        userId: "user-a",
        organization,
        membership: {
          userId: "user-a",
          organizationId: "org-a",
          role: "member",
        },
      }),
    ).toThrow(OrganizationAdminAccessDeniedError);
  });

  it("rejects a membership copied from another organization", () => {
    expect(() =>
      authorizeOrganizationAdmin({
        userId: "user-a",
        organization,
        membership: {
          userId: "user-a",
          organizationId: "org-b",
          role: "owner",
        },
      }),
    ).toThrow(OrganizationAdminAccessDeniedError);
  });
});
