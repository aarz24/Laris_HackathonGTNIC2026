"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isCloudConfigured } from "@/lib/env";
import { inventory, products } from "@/lib/laris-data";
import { currentMembership } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };
const workspaceInput = z.object({
  name: z.string().trim().min(2, "Nama usaha minimal 2 karakter.").max(80),
  owner: z.string().trim().min(2, "Nama pemilik minimal 2 karakter.").max(80),
  outlet: z.string().trim().min(2, "Nama outlet minimal 2 karakter.").max(80),
  kind: z.enum(["coffee", "restaurant", "bakery", "bar", "other"]),
  dayTarget: z.number().int().min(1000, "Target harian minimal Rp1.000.").max(1_000_000_000_000),
  starter: z.boolean(),
});

function workspaceSlug(name: string): string {
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "usaha";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function createWorkspaceAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  if (!isCloudConfigured) return { error: "Supabase belum dikonfigurasi." };
  const parsed = workspaceInput.safeParse({
    name: form.get("name"), owner: form.get("owner"), outlet: form.get("outlet"), kind: form.get("kind"),
    dayTarget: Number(form.get("dayTarget")), starter: form.get("starter") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data usaha belum valid." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  if (await currentMembership(supabase)) redirect("/");
  const input = parsed.data;
  const useStarterCatalog = input.starter && input.kind === "coffee";
  const { error } = await supabase.rpc("create_workspace", {
    p_name: input.name,
    p_slug: workspaceSlug(input.name),
    p_owner_name: input.owner,
    p_outlet_name: input.outlet,
    p_kind: input.kind,
    p_day_target: input.dayTarget,
    p_inventory: useStarterCatalog ? inventory.map((item) => ({
      code: item.id, name: item.name, unit: item.unit, cost: item.cost, reorder_point: item.reorderPoint,
      supplier: item.supplier, opening_stock: item.openingStock,
    })) : [],
    p_products: useStarterCatalog ? products.map((product) => ({
      code: product.id, name: product.name, category: product.category, price: product.price, image: product.image,
      recipe: product.recipe.map((line) => ({ code: line.itemId, quantity: line.quantity })),
    })) : [],
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  redirect("/");
}
