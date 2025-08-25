export type Phase = "PREMARKET" | "REGULAR" | "AFTERHOURS" | "CLOSED";

/** US market phase using America/New_York time. */
export function getMarketPhaseET(now = new Date()): Phase {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  const [h, m] = fmt.format(now).split(":").map(Number);
  const minutes = h * 60 + m;
  const t = (H:number,M:number)=>H*60+M;
  if (minutes >= t(7,0)  && minutes < t(9,30)) return "PREMARKET";
  if (minutes >= t(9,30) && minutes < t(16,0)) return "REGULAR";
  if (minutes >= t(16,0) && minutes < t(20,0)) return "AFTERHOURS";
  return "CLOSED";
}
