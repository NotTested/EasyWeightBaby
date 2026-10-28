"""Local HTTPS PWA test with verified TLS and temporary Chromium trust.

Needs openssl, certutil, Chromium, and DISPLAY or XVFB_PATH/Xvfb.
Requires write permission to the user's existing Chromium NSS database.
Only the uniquely named test CA is removed; existing trust is preserved.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import time
import uuid

root = Path(__file__).resolve().parent.parent
database = Path.home() / ".pki/nssdb"
if not database.is_dir():
    raise SystemExit("Existing Chromium NSS database is required; configure trusted test TLS first.")
display = os.environ.get("DISPLAY")
xvfb = os.environ.get("XVFB_PATH") or shutil.which("Xvfb")
if not display and not xvfb:
    raise SystemExit("Set DISPLAY or install Xvfb and set XVFB_PATH.")
nickname = "member-pwa-test-" + uuid.uuid4().hex
trusted = False
xserver = None

def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

with tempfile.TemporaryDirectory(prefix="member-pwa-tls-") as temporary:
    directory = Path(temporary)
    ca, ca_key = directory / "ca.crt", directory / "ca.key"
    cert, key = directory / "server.crt", directory / "server.key"
    csr, extensions = directory / "server.csr", directory / "extensions"
    try:
        run("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(ca_key),
            "-out", str(ca), "-days", "1", "-subj", "/CN=Member PWA temporary test CA",
            "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign")
        run("openssl", "req", "-newkey", "rsa:2048", "-nodes", "-keyout", str(key),
            "-out", str(csr), "-subj", "/CN=localhost")
        extensions.write_text("subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\n"
                              "keyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
        run("openssl", "x509", "-req", "-in", str(csr), "-CA", str(ca), "-CAkey", str(ca_key),
            "-CAcreateserial", "-out", str(cert), "-days", "1", "-extfile", str(extensions))
        key.chmod(0o600); ca_key.chmod(0o600)
        run("openssl", "verify", "-CAfile", str(ca), str(cert))
        run("certutil", "-A", "-d", "sql:" + str(database), "-n", nickname, "-t", "C,,", "-i", str(ca))
        trusted = True
        settings = os.environ.copy()
        if not display:
            # Xvfb selects a free display; avoid colliding with another task's display.
            display_file = directory / "display"
            with display_file.open("w") as output:
                xserver = subprocess.Popen([xvfb, "-displayfd", str(output.fileno()), "-screen", "0",
                    "1280x900x24", "-nolisten", "tcp"], pass_fds=(output.fileno(),),
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(50):
                assert xserver.poll() is None, "Xvfb exited"
                if display_file.read_text().strip(): break
                time.sleep(0.1)
            number = display_file.read_text().strip()
            assert number, "Xvfb did not become ready"
            display = ":" + number
        bundle = directory / "node-ca.pem"
        existing = settings.get("NODE_EXTRA_CA_CERTS")
        bundle.write_bytes((Path(existing).read_bytes() + b"\n" if existing else b"") + ca.read_bytes())
        settings.update(DISPLAY=display, PWA_HEADFUL="1", PWA_HTTPS_CERT_FILE=str(cert),
                        PWA_HTTPS_KEY_FILE=str(key), NODE_EXTRA_CA_CERTS=str(bundle))
        result = subprocess.run(["npm", "run", "test:pwa"], cwd=root, env=settings)
        raise SystemExit(result.returncode)
    finally:
        if xserver is not None:
            xserver.terminate(); xserver.wait(timeout=10)
        if trusted:
            run("certutil", "-D", "-d", "sql:" + str(database), "-n", nickname)
