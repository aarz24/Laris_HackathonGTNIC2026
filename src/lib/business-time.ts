/** Business timestamps must render identically on UTC hosts and users' devices. */
export function formatBusinessTime(date: string): string {
  return new Date(date).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
}

export function formatBusinessShortDate(date: string): string {
  return new Date(date).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });
}
