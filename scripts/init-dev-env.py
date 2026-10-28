"""Create local-only development credentials without overwriting an existing file."""
from pathlib import Path
import os
import secrets

path = Path(__file__).resolve().parent.parent / ".env"
if path.exists():
    print("Existing .env preserved.")
else:
    dev_password = secrets.token_hex(24)
    test_password = secrets.token_hex(24)
    lines = [
        f"DATABASE_URL=postgresql://member:{dev_password}@127.0.0.1:5432/member?schema=public",
        f"TEST_DATABASE_URL=postgresql://member:{test_password}@127.0.0.1:5433/member_test?schema=public",
        f"POSTGRES_PASSWORD={dev_password}",
        f"TEST_POSTGRES_PASSWORD={test_password}",
        f"BETTER_AUTH_SECRET={secrets.token_hex(32)}",
        "APP_URL=http://localhost:3000",
    ]
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write("\n".join(lines) + "\n")
    print("Created ignored local .env (0600); no credentials printed.")
