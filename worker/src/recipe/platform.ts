// Which links go to yt-dlp. Only these hosts: yt-dlp would follow almost any URL, and the SSRF
// guard of fetchPage does not apply to it.
export type Platform = "youtube" | "tiktok" | "instagram" | "web";

const HOSTS: Record<Exclude<Platform, "web">, string[]> = {
  youtube: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  tiktok: ["tiktok.com"],
  instagram: ["instagram.com"],
};

export function detectPlatform(raw: string): Platform {
  let host: string;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "web";
    if (url.port && url.port !== "443" && url.port !== "80") return "web";
    host = url.hostname.toLowerCase();
  } catch {
    return "web";
  }
  for (const [platform, domains] of Object.entries(HOSTS)) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return platform as Platform;
  }
  return "web";
}
