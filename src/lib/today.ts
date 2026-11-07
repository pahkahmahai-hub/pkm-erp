/** Today's date in Bangkok as yyyy-mm-dd (server + client safe). */
export function todayBkk(): string { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
export function monthBkk(): string { return todayBkk().slice(0, 7); }
