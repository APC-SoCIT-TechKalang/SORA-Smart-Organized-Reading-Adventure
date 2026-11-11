import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ReaderRequest = {
  email?: string;
  password?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  username?: string;
  birthdate?: string;
  mobileNumber?: string;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const authorization = request.headers.get("authorization");
  if (!url || !publishableKey || !secretKey) {
    return NextResponse.json(
      { error: "Reader provisioning is not configured." },
      { status: 503 },
    );
  }
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Librarian sign-in is required." },
      { status: 401 },
    );
  }

  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const role = await caller.schema("sora_v2").rpc("is_librarian");
  if (role.error || role.data !== true) {
    return NextResponse.json(
      { error: "Librarian access is required." },
      { status: 403 },
    );
  }

  let body: ReaderRequest;
  try {
    body = (await request.json()) as ReaderRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }
  const email = text(body.email).toLowerCase();
  const password = text(body.password);
  const firstName = text(body.firstName);
  const middleName = text(body.middleName);
  const lastName = text(body.lastName);
  const username = text(body.username);
  const birthdate = text(body.birthdate);
  const mobileNumber = text(body.mobileNumber);
  const strongPassword =
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (
    !email ||
    !email.includes("@") ||
    !strongPassword ||
    !firstName ||
    !lastName ||
    !username ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) ||
    !mobileNumber
  ) {
    return NextResponse.json(
      {
        error:
          "Complete every field. Passwords need 12+ characters with uppercase, lowercase, number, and symbol.",
      },
      { status: 400 },
    );
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (created.error || !created.data.user) {
    return NextResponse.json(
      { error: created.error?.message ?? "Auth account could not be created." },
      { status: 400 },
    );
  }
  const authUser = created.data.user;
  try {
    const inserted = await admin
      .schema("sora_v2")
      .from("users")
      .insert({
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        username,
        password_hash: null,
        birthdate,
        user_role: "Reader",
        mobile_number: mobileNumber,
      })
      .select("user_id")
      .single();
    if (inserted.error) throw inserted.error;
    const linked = await admin.auth.admin.updateUserById(authUser.id, {
      app_metadata: {
        ...authUser.app_metadata,
        sora_user_id: inserted.data.user_id,
      },
    });
    if (linked.error) {
      await admin
        .schema("sora_v2")
        .from("users")
        .delete()
        .eq("user_id", inserted.data.user_id);
      throw linked.error;
    }
    return NextResponse.json(
      { userId: inserted.data.user_id },
      { status: 201 },
    );
  } catch (cause) {
    await admin.auth.admin.deleteUser(authUser.id);
    const message =
      cause && typeof cause === "object" && "message" in cause
        ? String(cause.message)
        : "Reader account could not be created.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
