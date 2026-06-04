export function buildGoogleAuthRedirect(url: URL) {
  return `${url.origin}${url.pathname}${url.search}`;
}

export function getInviteTokenFromUrl(url: URL) {
  const token = url.searchParams.get("invite")?.trim() || url.searchParams.get("token")?.trim() || "";
  return token || null;
}
