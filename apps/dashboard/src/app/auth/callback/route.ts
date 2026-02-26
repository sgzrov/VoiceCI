import { handleAuth } from "@workos-inc/authkit-nextjs";

export const GET = handleAuth({
  returnPathname: "/runs",
  baseURL: process.env["NEXT_PUBLIC_WORKOS_REDIRECT_URI"]?.replace(
    "/auth/callback",
    "",
  ),
});
