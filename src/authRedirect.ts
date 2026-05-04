export function buildGoogleAuthRedirect(url: URL) {
  return `${url.origin}${url.pathname}${url.search}`;
}

export function getInviteTokenFromUrl(url: URL) {
  const token = url.searchParams.get("invite")?.trim() ?? "";
  return token || null;
}
