import { loadEnvFile } from "node:process";

import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import {
  MongoClient,
  ObjectId,
  ServerApiVersion,
} from "mongodb";
import * as z from "zod";

import { storePermissionValues } from "@/domain/stores/schemas";
import { ensureFoundationIndexesForDb } from "@/server/db/foundation-indexes";

const seedEnvironmentSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"),
      "MONGODB_URI invalide",
    ),
  MONGODB_AUTH_DB: z.string().trim().min(1).default("fl_cockpit_auth"),
  MONGODB_APP_DB: z.string().trim().min(1).default("fl_cockpit_app"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SEED_DEMO_EMAIL: z.email().default("admin@fleg.local"),
  SEED_DEMO_PASSWORD: z.string().min(8).max(128).default("FlegDemo!2026"),
  SEED_DEMO_USER_NAME: z.string().trim().min(1).default("Administrateur F&L"),
  SEED_DEMO_ORGANIZATION_NAME: z
    .string()
    .trim()
    .min(1)
    .default("Réseau F&L Démo"),
  SEED_DEMO_ORGANIZATION_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .default("reseau-fl-demo"),
  SEED_DEMO_STORE_CODE: z.string().trim().min(1).default("DEMO-01"),
  SEED_DEMO_STORE_NAME: z.string().trim().min(1).default("Magasin F&L Démo"),
});

interface UserDocument {
  email: string;
}

interface OrganizationDocument {
  slug: string;
}

interface StoreDocument {
  organizationId: string;
  code: string;
  name: string;
  active: boolean;
  dataRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

function idCandidates(value: string): Array<string | ObjectId> {
  return ObjectId.isValid(value) ? [value, new ObjectId(value)] : [value];
}

async function run() {
  loadEnvFile(process.env.SEED_ENV_FILE ?? ".env.local");
  const env = seedEnvironmentSchema.parse(process.env);
  const client = new MongoClient(env.MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();

  try {
    const authDb = client.db(env.MONGODB_AUTH_DB);
    const appDb = client.db(env.MONGODB_APP_DB);
    const auth = betterAuth({
      appName: "F&L Cockpit",
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      database: mongodbAdapter(authDb, { client, transaction: false }),
      emailAndPassword: {
        enabled: true,
        disableSignUp: false,
      },
      advanced: {
        database: {
          joins: true,
        },
      },
      trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
      plugins: [organization()],
    });

    const normalizedEmail = env.SEED_DEMO_EMAIL.toLocaleLowerCase("fr-FR");
    const existingUser = await authDb
      .collection<UserDocument>("user")
      .findOne({ email: normalizedEmail });
    const signedUp = existingUser === null;
    const userId = existingUser
      ? existingUser._id.toString()
      : (
          await auth.api.signUpEmail({
            body: {
              email: normalizedEmail,
              password: env.SEED_DEMO_PASSWORD,
              name: env.SEED_DEMO_USER_NAME,
            },
          })
        ).user.id;

    const existingOrganization = await authDb
      .collection<OrganizationDocument>("organization")
      .findOne({ slug: env.SEED_DEMO_ORGANIZATION_SLUG });
    const organizationCreated = existingOrganization === null;
    const organizationId = existingOrganization
      ? existingOrganization._id.toString()
      : (
          await auth.api.createOrganization({
            body: {
              name: env.SEED_DEMO_ORGANIZATION_NAME,
              slug: env.SEED_DEMO_ORGANIZATION_SLUG,
              userId,
            },
          })
        ).id;

    const existingOrganizationMembership = await authDb
      .collection("member")
      .findOne({
        organizationId: { $in: idCandidates(organizationId) },
        userId: { $in: idCandidates(userId) },
      });
    const organizationMembershipCreated =
      existingOrganizationMembership === null;

    if (organizationMembershipCreated) {
      await auth.api.addMember({
        body: {
          organizationId,
          userId,
          role: "owner",
        },
      });
    }

    await ensureFoundationIndexesForDb(appDb);
    const now = new Date();
    const stores = appDb.collection<StoreDocument>("stores");
    const existingStore = await stores.findOne({
      organizationId,
      code: env.SEED_DEMO_STORE_CODE,
    });
    const store = await stores.findOneAndUpdate(
      {
        organizationId,
        code: env.SEED_DEMO_STORE_CODE,
      },
      {
        $set: {
          name: env.SEED_DEMO_STORE_NAME,
          active: true,
          updatedAt: now,
        },
        $setOnInsert: {
          organizationId,
          code: env.SEED_DEMO_STORE_CODE,
          dataRevision: 0,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!store) {
      throw new Error("Le magasin de démonstration n'a pas pu être créé");
    }

    const storeMembershipResult = await appDb
      .collection("storeMemberships")
      .updateOne(
        { storeId: store._id, userId },
        {
          $set: {
            organizationId,
            role: "store_director",
            permissions: [...storePermissionValues],
            active: true,
            updatedAt: now,
          },
          $setOnInsert: {
            storeId: store._id,
            userId,
            createdAt: now,
          },
        },
        { upsert: true },
      );

    console.log(
      JSON.stringify(
        {
          status: "ready",
          user: {
            id: userId,
            email: normalizedEmail,
            password: signedUp
              ? env.SEED_DEMO_PASSWORD
              : "inchangé (utilisateur déjà présent)",
            created: signedUp,
          },
          organization: {
            id: organizationId,
            slug: env.SEED_DEMO_ORGANIZATION_SLUG,
            created: organizationCreated,
            membershipCreated: organizationMembershipCreated,
          },
          store: {
            id: store._id.toString(),
            code: store.code,
            name: store.name,
            created: existingStore === null,
            membershipCreated: storeMembershipResult.upsertedCount === 1,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  console.error(`Bootstrap démo impossible : ${message}`);
  process.exitCode = 1;
});
