import { useEffect, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

// Initialize the API client to read the token from local storage
setAuthTokenGetter(() => localStorage.getItem("tvr_admin_token"));

// If the server rejects the saved admin token (expired, or signing rules changed), clear it and
// go back to the home page instead of showing an admin panel full of empty lists.
if (typeof window !== "undefined" && !(window as any).__tvrAuthFetchPatched) {
  (window as any).__tvrAuthFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if (res.status === 401) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const sentToken = (headers.get("Authorization") || "").startsWith("Bearer ");
      if (sentToken && url.includes("/api/") && !url.includes("/admin/login") && localStorage.getItem("tvr_admin_token")) {
        localStorage.removeItem("tvr_admin_token");
        window.location.replace(import.meta.env.BASE_URL);
      }
    }
    return res;
  };
}

export function useAuth() {
  const [token, setTokenState] = useState<string | null>(
    localStorage.getItem("tvr_admin_token")
  );

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("tvr_admin_token", newToken);
    } else {
      localStorage.removeItem("tvr_admin_token");
    }
    setTokenState(newToken);
  };

  return { token, isAuthenticated: !!token, setToken };
}
