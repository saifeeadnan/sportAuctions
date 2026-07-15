import { NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { AuthError } from "@/lib/auth/guards";
import { DomainError } from "@/lib/errors";

/** Converts any error thrown inside a route handler into a JSON response the client can parse. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003" &&
    error.message.includes("createdById")
  ) {
    return NextResponse.json(
      { error: "Your session is out of date — please log out and log back in, then try again." },
      { status: 409 }
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}
