"""Read-only local Compose runtime, disk and optional backup integrity checks.
Does not start containers, run migrations, change images or print environment/logs.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
INSPECT = '{"service":{{json (index .Config.Labels "com.docker.compose.service")}},"status":{{json .State.Status}},"exitCode":{{.State.ExitCode}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},"restarts":{{.RestartCount}},"oomKilled":{{.State.OOMKilled}},"image":{{json .Config.Image}},"imageId":{{json .Image}}}'


def docker(*args):
    env = os.environ.copy()
    for name in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
        env.pop(name, None)
    return subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args], env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          check=True, timeout=30, text=True).stdout


def evaluate_services(services):
    issues, warnings = [], []
    for name in ("db", "migrate", "app"):
        matches = [service for service in services if service["service"] == name]
        if len(matches) != 1:
            issues.append(name + ": expected one container")
            continue
        service = matches[0]
        if name == "migrate":
            if service["status"] != "exited" or service["exitCode"] != 0:
                issues.append("migrate: not completed successfully")
        elif service["status"] != "running" or service["health"] != "healthy":
            issues.append(name + ": not running and healthy")
        if service["oomKilled"]:
            issues.append(name + ": OOM detected")
        if service["restarts"]:
            warnings.append(name + ": restart count is nonzero; compare with previous observation")
    return issues, warnings


def check_backup(directory, max_age_hours, now=None):
    directory = Path(directory).resolve()
    if directory.stat().st_mode & 0o077:
        raise ValueError("backup directory permissions")
    candidates = sorted(directory.glob("member-*.json"), reverse=True)
    if not candidates:
        raise ValueError("backup missing")
    manifest = candidates[0]
    if manifest.is_symlink() or manifest.stat().st_mode & 0o077:
        raise ValueError("manifest permissions")
    info = json.loads(manifest.read_text())
    if not isinstance(info, dict):
        raise ValueError("backup manifest must be an object")
    expected = manifest.with_suffix(".dump")
    if (expected.is_symlink() or info.get("format") != 1 or info.get("postgresMajor") != 17
            or info.get("archive") != expected.name or expected.stat().st_mode & 0o077
            or info.get("bytes") != expected.stat().st_size):
        raise ValueError("backup metadata or permissions")
    created = datetime.fromisoformat(info["createdAt"])
    if created.tzinfo is None:
        raise ValueError("backup timezone missing")
    age = ((now or datetime.now(timezone.utc)) - created).total_seconds() / 3600
    if age < -5 / 60 or age > max_age_hours:
        raise ValueError("backup stale or future dated")
    with expected.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != info.get("sha256"):
            raise ValueError("backup checksum mismatch")
    return {"status": "checksum-and-age-ok", "ageHours": round(age, 2), "restore": "not-checked", "offNasCopy": "not-checked"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--project", default="member-app")
    parser.add_argument("--backup-directory")
    parser.add_argument("--max-backup-age-hours", type=float, default=26)
    parser.add_argument("--disk-path", default=str(ROOT))
    parser.add_argument("--min-free-gib", type=float, default=2)
    parser.add_argument("--expect-app-image")
    args = parser.parse_args()
    if not (0 < args.max_backup_age_hours < float("inf")) or not (0 <= args.min_free_gib < float("inf")):
        parser.error("thresholds must be finite; backup age positive and free space nonnegative")
    ids = docker("compose", "--env-file", str(Path(args.env_file).resolve()), "-f", str(ROOT / "compose.prod.yaml"),
                 "-p", args.project, "ps", "--all", "--quiet", "db", "migrate", "app").splitlines()
    services = [json.loads(docker("inspect", "--format", INSPECT, container)) for container in ids]
    issues, warnings = evaluate_services(services)
    free = shutil.disk_usage(args.disk_path).free / (1024 ** 3)
    if free < args.min_free_gib:
        issues.append("disk: below configured free space threshold")
    if args.expect_app_image and not any(s["service"] == "app" and s["image"] == args.expect_app_image for s in services):
        issues.append("app: unexpected image reference")
    backup = {"status": "not-checked"}
    if args.backup_directory:
        try:
            backup = check_backup(args.backup_directory, args.max_backup_age_hours)
        except (OSError, ValueError, KeyError, TypeError):
            issues.append("backup: missing, stale, corrupt or permissions invalid")
            backup = {"status": "failed"}
    else:
        warnings.append("backup: not checked; provide --backup-directory")
    print(json.dumps({"status": "failed" if issues else "runtime-ok", "services": services,
                      "diskFreeGiB": round(free, 2), "backup": backup, "issues": issues, "warnings": warnings,
                      "pending": ["public HTTPS and authenticated browser checks", "restore rehearsal and off-NAS copy"]}))
    return 1 if issues else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('FAIL: unable to inspect local Compose runtime; check Docker, configuration and file access. No changes made.', file=sys.stderr)
        sys.exit(1)
