/** VAPID public key (ส่วนสาธารณะ — คู่กับ private key ที่เก็บใน app_secrets ของฐานข้อมูล) */
export const VAPID_PUBLIC_KEY = "BPJHv8VgtjxyB0gd4nd6wODwDVV-EV9BI68WBmIcTvbIyUnZQ8MIcV53w3CkIuXqD4BX_HalFVRs_Kc7OfcPvzQ";

export function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
