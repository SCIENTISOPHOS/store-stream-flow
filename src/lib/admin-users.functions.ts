import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé : administrateur requis");
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().trim().email().max(255),
      password: z.string().min(8).max(128),
      display_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().max(30).optional().nullable(),
      role: z.enum(["admin", "user"]).default("user"),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        display_name: data.display_name,
        phone: data.phone ?? null,
      },
    });
    if (error) throw new Error(error.message);
    const newId = created.user!.id;

    // handle_new_user trigger creates profile + default role. Override role if needed.
    if (data.role === "admin") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newId, role: "admin" });
      if (rErr) throw new Error(rErr.message);
    }

    // Ensure profile reflects provided phone/display_name (trigger uses metadata, but be safe)
    await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.display_name, phone: data.phone ?? null })
      .eq("id", newId);

    return { id: newId };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      display_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().max(30).nullable().optional(),
      email: z.string().trim().email().max(255).optional(),
      password: z.string().min(8).max(128).optional().or(z.literal("")),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.display_name, phone: data.phone ?? null })
      .eq("id", data.user_id);
    if (pErr) throw new Error(pErr.message);

    const authPatch: { email?: string; password?: string } = {};
    if (data.email) authPatch.email = data.email;
    if (data.password && data.password.length > 0) authPatch.password = data.password;
    if (Object.keys(authPatch).length > 0) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(
        data.user_id,
        authPatch
      );
      if (aErr) throw new Error(aErr.message);
    }
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("Vous ne pouvez pas supprimer votre propre compte");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
