import * as z from "zod";

export const signInInputSchema = z.object({
  email: z.email("Saisissez une adresse e-mail valide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(128),
});

export type SignInInput = z.infer<typeof signInInputSchema>;
