import "server-only";

import { z } from "zod";

export const CredencialesSchema = z.object({
  correo: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
