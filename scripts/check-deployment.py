"""Read-only HTTPS deployment checks. Uses system TLS trust and inherited proxies.

Usage: python3 scripts/check-deployment.py https://workout.example.com
Optional DEPLOY_CA_FILE adds a trusted CA without disabling verification.
No login, database writes, browser installation, or credentials are required.
"""
import json
import os
import ssl
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urljoin
from urllib.request import build_opener, HTTPSHandler, HTTPRedirectHandler, Request


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    if len(sys.argv) != 2:
        raise ValueError("Usage: python3 scripts/check-deployment.py HTTPS_ORIGIN")
    origin = sys.argv[1]
    url = urlsplit(origin)
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.path not in ("", "/") or url.query or url.fragment):
        raise ValueError("Use an HTTPS origin without credentials, path, query or fragment")
    origin = origin.rstrip("/")
    context = ssl.create_default_context()
    if os.environ.get("DEPLOY_CA_FILE"):
        context.load_verify_locations(os.environ["DEPLOY_CA_FILE"])
    opener = build_opener(HTTPSHandler(context=context), NoRedirect())

    def get(path, status=200):
        target = urljoin(origin + "/", path)
        if urlsplit(target).netloc != url.netloc or urlsplit(target).scheme != "https":
            raise ValueError("Resource must stay on the HTTPS origin")
        try:
            response = opener.open(Request(target, headers={"User-Agent": "MemberDeploymentCheck/1"}), timeout=15)
        except HTTPError as error:
            response = error
        with response:
            if response.status != status:
                raise ValueError(f"{path}: expected HTTP {status}, received {response.status}; check proxy and redirects")
            body = response.read(2 * 1024 * 1024 + 1)
            if len(body) > 2 * 1024 * 1024:
                raise ValueError(f"{path}: response too large")
            return response.headers, body

    _, health = get("/api/health")
    if json.loads(health).get("status") != "ok":
        raise ValueError("Health response does not report ok")
    get("/api/me", 401)
    headers, _ = get("/login")
    if "text/html" not in headers.get("Content-Type", ""):
        raise ValueError("Login page is not HTML")
    headers, raw = get("/manifest.webmanifest")
    if "json" not in headers.get("Content-Type", ""):
        raise ValueError("Manifest content type is not JSON")
    manifest = json.loads(raw)
    for key, expected in {"id": "/", "scope": "/", "start_url": "/", "display": "standalone"}.items():
        if manifest.get(key) != expected:
            raise ValueError(f"Unexpected manifest {key}")
    icons = manifest.get("icons", [])
    if not icons or not any("maskable" in icon.get("purpose", "").split() for icon in icons):
        raise ValueError("Manifest must include maskable icons")
    for icon in icons:
        headers, raw = get(icon["src"])
        if "image/png" not in headers.get("Content-Type", "") or not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError("Icon response is not PNG")
    headers, raw = get("/sw.js")
    if "javascript" not in headers.get("Content-Type", "") or "no-store" not in headers.get("Cache-Control", "").lower():
        raise ValueError("Worker must be JavaScript with Cache-Control: no-store")
    if b"member-offline-" not in raw:
        raise ValueError("Unexpected worker response")
    print("PASS: verified HTTPS, DB health, anonymous access control, login, manifest, icons and uncached worker")
    print("PENDING: authenticated cookies, Chrome install, standalone launch and real-device checks")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, URLError):
        # Never print response bodies, proxy URLs, credentials or raw TLS errors.
        print("FAIL: check HTTPS origin, certificate trust, proxy configuration and application responses", file=sys.stderr)
        sys.exit(1)
