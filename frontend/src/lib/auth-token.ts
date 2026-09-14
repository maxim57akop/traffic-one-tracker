const TOKEN_KEY = "trafficone_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const token = window.localStorage?.getItem(TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch {
    // Some embedded browsers can block localStorage.
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setAuthToken(token: string) {
  try {
    window.localStorage?.setItem(TOKEN_KEY, token);
  } catch {
    // Cookie fallback below keeps login working.
  }

  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearAuthToken() {
  try {
    window.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    // Cookie cleanup below still runs.
  }

  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}
