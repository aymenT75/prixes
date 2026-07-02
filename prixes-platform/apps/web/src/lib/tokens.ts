// Token persistence. Access token kept in memory + localStorage for PWA reloads.
// (For max security move refresh to an httpOnly cookie via a Next.js route handler.)

const ACCESS = "prixes.access";
const REFRESH = "prixes.refresh";

export const tokenStore = {
  get access(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS);
  },
  get refresh(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};
