import { NextResponse } from "next/server";
import { requireTocUser, type TocAuthenticatedUser } from "@/lib/toc-auth";

type OdinPermission =
  | { kind: "odin"; user: undefined; error: undefined }
  | { kind: "toc"; user: TocAuthenticatedUser; error: undefined }
  | { kind: "none"; user: undefined; error: NextResponse };

function safeCompare(left: string, right: string) {
  return left.length === right.length && left === right;
}

export async function requireOdinOrTocUser(request: Request): Promise<OdinPermission> {
  const configuredKey = process.env.ODIN_API_KEY;
  const incomingKey = request.headers.get("x-odin-api-key") || "";

  if (configuredKey && incomingKey && safeCompare(incomingKey, configuredKey)) {
    return { kind: "odin", user: undefined, error: undefined };
  }

  const permission = await requireTocUser(request);
  if (permission.error) {
    return {
      kind: "none",
      user: undefined,
      error: NextResponse.json({ error: "Odin API key or authenticated TOC user session is required." }, { status: 401 })
    };
  }

  return { kind: "toc", user: permission.user, error: undefined };
}

export function hasOdinDirectAccess(user: TocAuthenticatedUser) {
  return user.role === "admin" || (user.role === "manager" && user.regions.includes("National"));
}

export async function requireOdinOrTocNationalUser(request: Request): Promise<OdinPermission> {
  const permission = await requireOdinOrTocUser(request);
  if (permission.error || permission.kind === "odin") return permission;

  if (hasOdinDirectAccess(permission.user)) return permission;

  return {
    kind: "none",
    user: undefined,
    error: NextResponse.json({ error: "Odin Command is available to Admin and National users only." }, { status: 403 })
  };
}

export function isOdinExternal(permission: OdinPermission) {
  return permission.kind === "odin";
}
