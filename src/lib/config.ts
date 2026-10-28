export function appUrl() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL을 설정하세요.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("APP_URL은 경로 없는 HTTP(S) 주소여야 합니다.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("운영 환경 APP_URL에는 HTTPS가 필요합니다.");
  }
  return url.origin;
}
