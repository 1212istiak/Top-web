import { useEffect, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

// Initialize the API client to read the token from local storage
setAuthTokenGetter(() => localStorage.getItem("tvr_admin_token"));

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
