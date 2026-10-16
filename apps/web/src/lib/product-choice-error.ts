import { NextResponse } from "next/server";
import { UserSupabaseError } from "./supabase-user-rest";

export function productChoiceError(error: unknown) {
  const conflict = error instanceof UserSupabaseError && error.code === "40001";
  const forbidden = error instanceof UserSupabaseError && [401, 403].includes(error.status);
  const requestId = crypto.randomUUID();
  console.error("product_choice_failed", { requestId, code: error instanceof UserSupabaseError ? error.code : undefined });
  return NextResponse.json({ requestId, error: conflict
    ? "Posten eller produktvalet har ändrats av någon annan. Stäng och öppna kortet igen innan du sparar."
    : forbidden ? "Du har inte behörighet att ändra produktvalet."
    : "Produktvalet kunde inte sparas. Försök igen." }, { status: conflict ? 409 : forbidden ? 403 : 503 });
}

export function validEditRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
