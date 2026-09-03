"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | null;

export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const nome = String(formData.get("nome") || "");
  const cognome = String(formData.get("cognome") || "");
  const ruolo = String(formData.get("ruolo") || "inquilino");
  const privacyAccettata = formData.get("privacy") === "on";

  if (!privacyAccettata) {
    return { error: "Devi accettare la privacy per continuare." };
  }
  if (password.length < 8) {
    return { error: "La password deve avere almeno 8 caratteri." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome,
        cognome,
        ruolo,
        privacy_accettata: true,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/auth/check-email");
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email o password non corrette." };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
