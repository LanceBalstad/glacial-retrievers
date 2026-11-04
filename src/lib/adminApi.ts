import { getIdToken } from "./firebase";

// fetch() for admin-only API routes: attaches the signed-in admin's Firebase
// ID token, which the server verifies against VITE_ALLOWED_ADMIN_EMAIL.
export const adminFetch = async (
  input: string,
  init: RequestInit = {},
): Promise<Response> => {
  const token = await getIdToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
};
