import * as z from "zod";

export const signInInputSchema = z.object({
  email: z.email("Saisissez une adresse e-mail valide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128),
});

export type SignInInput = z.infer<typeof signInInputSchema>;

export const authenticationCallbackPathSchema = z
  .string()
  .max(500)
  .refine(
    (value) => value.startsWith("/") && !value.startsWith("//"),
    "Chemin de retour invalide",
  )
  .default("/stores");
