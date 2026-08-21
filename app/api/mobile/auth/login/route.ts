import { NextResponse } from "next/server";
import { verifyCredentials, AccountDisabledSignin } from "@/lib/auth/credentials";
import { encodeMobileToken } from "@/lib/auth/mobileToken";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const loginId = typeof body?.loginId === "string" ? body.loginId : undefined;
  const password = typeof body?.password === "string" ? body.password : undefined;

  let user;
  try {
    user = await verifyCredentials(loginId, password, req);
  } catch (error) {
    if (error instanceof AccountDisabledSignin) {
      return NextResponse.json({ error: "This account has been disabled." }, { status: 403 });
    }
    throw error;
  }
  if (!user) {
    return NextResponse.json({ error: "Invalid login ID or password" }, { status: 401 });
  }

  const token = await encodeMobileToken({
    id: user.id,
    name: user.name,
    isSiteAdmin: user.isSiteAdmin,
    memberships: user.memberships,
    analyticsSessionId: user.analyticsSessionId,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      isSiteAdmin: user.isSiteAdmin,
      memberships: user.memberships,
    },
  });
}
