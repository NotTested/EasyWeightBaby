"""Local Docker PostgreSQL custom-format backup and isolated restore rehearsal.
Never restores into an existing database. No credentials are printed or required
on the command line: pg_dump uses the running DB container's local Unix socket.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from uuid import uuid4

PG_IMAGE = "postgres:17-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27"
ROOT = Path(__file__).resolve().parent.parent


def docker(*args, stdin=None, stdout=subprocess.PIPE):
    env = os.environ.copy()
    for key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
        env.pop(key, None)
    return subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args],
                          env=env, stdin=stdin, stdout=stdout, stderr=subprocess.PIPE,
                          check=True, timeout=600).stdout


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def backup(container, database, user, destination):
    destination = Path(destination).resolve()
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.stat().st_mode & 0o077:
        raise ValueError("Backup directory must have mode 0700")
    name = "member-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex
    archive = destination / (name + ".dump")
    partial = destination / (name + ".partial")
    manifest = destination / (name + ".json")
    try:
        with partial.open("xb") as output:
            os.chmod(partial, 0o600)
            docker("exec", container, "pg_dump", "--format=custom", "--no-owner", "--no-privileges",
                   "--username", user, "--dbname", database, stdout=output)
            output.flush()
            os.fsync(output.fileno())
        if partial.stat().st_size < 5:
            raise ValueError("Empty backup")
        with partial.open("rb") as stream:
            if stream.read(5) != b"PGDMP":
                raise ValueError("Unexpected archive format")
        info = {"format": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
                "archive": archive.name, "bytes": partial.stat().st_size,
                "sha256": digest(partial), "postgresMajor": 17}
        with manifest.open("x") as output:
            os.chmod(manifest, 0o600)
            json.dump(info, output, indent=2)
            output.flush()
            os.fsync(output.fileno())
        partial.rename(archive)
        return archive
    except BaseException:
        for file in (partial, manifest):
            file.unlink(missing_ok=True)
        raise


def restore_check(archive, verify_sql=None):
    archive = Path(archive).resolve()
    info = json.loads(archive.with_suffix(".json").read_text())
    if (info.get("format") != 1 or info.get("postgresMajor") != 17
            or info.get("archive") != archive.name or info.get("bytes") != archive.stat().st_size
            or info.get("sha256") != digest(archive)):
        raise ValueError("Backup checksum or manifest mismatch")
    name = "member-restore-" + uuid4().hex
    try:
        # No ports, no external network, no persistent volume. Trust is limited
        # to this disposable container's Unix socket; never used in production.
        docker("run", "--detach", "--name", name, "--network", "none", "--memory", "1g",
               "--tmpfs", "/var/lib/postgresql/data:rw,size=768m", "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
               "--env", "POSTGRES_USER=member", "--env", "POSTGRES_DB=member_restore", PG_IMAGE)
        for _ in range(60):
            try:
                docker("exec", name, "sh", "-c", 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U member -d member_restore')
                break
            except subprocess.CalledProcessError:
                time.sleep(0.5)
        else:
            raise ValueError("Restore database did not become ready")
        with archive.open("rb") as source:
            docker("exec", "-i", name, "pg_restore", "--exit-on-error", "--single-transaction",
                   "--no-owner", "--no-privileges", "-U", "member", "-d", "member_restore", stdin=source)
        if verify_sql is not None:
            with tempfile.TemporaryFile() as sql:
                sql.write(verify_sql.encode()); sql.seek(0)
                docker("exec", "-i", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "member", "-d", "member_restore", stdin=sql)
        # Report only table names and row counts, never personal row contents.
        query = b"SELECT format('SELECT json_build_object(''table'', %L, ''rows'', count(*)) FROM %I.%I;', tablename, schemaname, tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename\n\\gexec\n"
        with tempfile.TemporaryFile() as sql:
            sql.write(query); sql.seek(0)
            raw = docker("exec", "-i", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "member", "-d", "member_restore", stdin=sql)
        rows = [json.loads(line) for line in raw.decode().splitlines() if line.startswith("{")]
        if not rows:
            raise ValueError("Restored database has no public tables")
        return rows
    finally:
        docker("rm", "--force", name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("backup")
    create.add_argument("--env-file", required=True)
    create.add_argument("--project", default="member-app")
    create.add_argument("--directory", required=True)
    restore = commands.add_parser("restore-check")
    restore.add_argument("archive")
    args = parser.parse_args()
    if args.command == "backup":
        raw = docker("compose", "--env-file", str(Path(args.env_file).resolve()), "-f", str(ROOT / "compose.prod.yaml"),
                     "-p", args.project, "ps", "--status", "running", "-q", "db").decode().splitlines()
        if len(raw) != 1:
            raise ValueError("Expected one running production DB container")
        archive = backup(raw[0], "member", "member", args.directory)
        print("Backup complete:", archive)
        print("Run restore-check and copy the dump + JSON manifest to protected storage outside the NAS.")
    else:
        print(json.dumps({"status": "restore-verified", "tables": restore_check(args.archive)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError):
        print("Backup/restore failed. Check local Docker, disk space, file permissions and PostgreSQL compatibility. No existing database was restored or deleted.", file=sys.stderr)
        sys.exit(1)
