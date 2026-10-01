"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) throw error;
  redirect(data.url); // off to Google's sign-in screen
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const updates: Record<string, string> = {
    first_name: String(formData.get("first_name") ?? ""),
    last_name: String(formData.get("last_name") ?? ""),
  };

  // Photo goes to the "avatars" Storage bucket; only its URL is saved in the table
  const photo = formData.get("photo") as File | null;
  if (photo && photo.size > 0) {
    const path = `${user.id}/avatar`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, photo, { upsert: true, contentType: photo.type });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    updates.profile_pic = `${data.publicUrl}?t=${Date.now()}`; // ?t= busts the browser cache
  }

  // upsert = update your row, or create it if the trigger never made one
  const { error } = await supabase.from("profiles").upsert({ id: user.id, ...updates });
  if (error) throw new Error(`Saving profile failed: ${error.message}`);

  revalidatePath("/", "layout");
  redirect("/members");
}
