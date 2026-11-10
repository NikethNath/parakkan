import { z } from "zod";
import { Prisma } from "@prisma/client";
import { istToday } from "@/lib/format";

/**
 * A DU as the setup form sends it: its name, the Paytm QR standing at it, and
 * its nozzles, each pinned by a meter reading on a day. See src/lib/duCheck.ts
 * for how the nozzles are followed from there.
 */
export const dispenserSchema = z
  .object({
    name: z.string().trim().min(1, "Give the DU a name").max(20),
    // Blank means the QR carries the DU's own name — DU1's QR is "DU1".
    posId: z.string().trim().max(40).optional(),
    nozzles: z
      .array(
        z.object({
          product: z.enum(["MS", "HSD"]),
          reading: z.coerce.number().finite().positive("Enter the nozzle's meter reading"),
          readOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day of that reading"),
        }),
      )
      .min(1, "Bind at least one nozzle")
      .max(2, "A DU has two nozzles"),
  })
  .superRefine((v, ctx) => {
    v.nozzles.forEach((n, i) => {
      if (n.readOn > istToday())
        ctx.addIssue({ code: "custom", path: ["nozzles", i, "readOn"], message: "That day hasn't happened yet" });
    });
  })
  .transform((v) => ({
    name: v.name.toUpperCase(),
    posId: (v.posId || v.name).toUpperCase(),
    nozzles: v.nozzles,
  }));

export type DispenserInput = z.output<typeof dispenserSchema>;

export const nozzleRows = (d: DispenserInput) =>
  d.nozzles.map((n) => ({
    product: n.product,
    reading: n.reading,
    readOn: new Date(`${n.readOn}T00:00:00.000Z`),
  }));

/** A unique clash on name or QR, said in words. */
export function clashMessage(e: unknown): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = String((e.meta?.target as string[] | undefined)?.join(",") ?? "");
    return target.includes("posId") ? "Another DU already uses that QR" : "There's already a DU with that name";
  }
  return null;
}
