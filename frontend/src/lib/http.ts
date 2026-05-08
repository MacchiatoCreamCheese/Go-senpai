/** HTTP plumbing shared by api.ts and the auth provider. Kept token-aware
 *  but free of any dependency on the React auth context, so api.ts can import
 *  it without creating a cycle. */

let _token: string | null = null;

export function setAccessToken(token: string | null): void {
  _token = token;
}

export function getAccessTokenSync(): string | null {
  return _token;
}

export const AUTH_401_EVENT = "senpai:auth-401";

/** fetch wrapper that injects Authorization: Bearer <jwt> when set, and fires
 *  AUTH_401_EVENT on a 401 from an authenticated request so the AuthProvider
 *  can refresh or sign out. */
export async function api(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${_token}`);
  }
  const resp = await fetch(input, { ...init, headers });
  if (resp.status === 401 && _token) {
    window.dispatchEvent(new CustomEvent(AUTH_401_EVENT));
  }
  return resp;
}
