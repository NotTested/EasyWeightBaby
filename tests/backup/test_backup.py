"""Docker-backed backup rehearsal using only UUID-scoped synthetic containers."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from uuid import uuid4

spec = importlib.util.spec_from_file_location("backup", Path(__file__).resolve().parents[2] / "scripts/database-backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTest(unittest.TestCase):
    def test_dump_restore_and_failure_guards(self):
        name = "member-backup-test-" + uuid4().hex
        try:
            backup.docker("run", "-d", "--name", name, "--network", "none", "--tmpfs",
                          "/var/lib/postgresql/data:rw,size=768m", "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
                          "--env", "POSTGRES_USER=member", "--env", "POSTGRES_DB=member", backup.PG_IMAGE)
            for _ in range(60):
                try:
                    backup.docker("exec", name, "sh", "-c", 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U member -d member')
                    break
                except subprocess.CalledProcessError:
                    time.sleep(0.5)
            else:
                self.fail("Synthetic PostgreSQL did not become ready")
            # Restore all real application migration DDL, plus a synthetic fixture
            # to verify Unicode, NULL/zero, owner relationships and actual values.
            sql = "\n".join(p.read_text() for p in sorted((backup.ROOT / "prisma/migrations").glob("*/migration.sql")))
            sql += """
CREATE TABLE backup_owner(id text PRIMARY KEY);
CREATE TABLE backup_record(id int PRIMARY KEY, owner text REFERENCES backup_owner(id), note text, weight numeric, reps int);
INSERT INTO backup_owner VALUES ('one'), ('two');
INSERT INTO backup_record VALUES (1,'one','한글 운동',NULL,0),(2,'two','left/right',12.5,8);
CREATE FUNCTION backup_assert() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN
IF (SELECT count(*) FROM backup_record WHERE note='한글 운동' AND weight IS NULL AND reps=0) <> 1
 OR (SELECT count(*) FROM backup_record WHERE owner='two' AND weight=12.5 AND reps=8) <> 1
 THEN RAISE EXCEPTION 'fixture mismatch'; END IF; RETURN true; END $$;

"""
            with tempfile.TemporaryFile() as source:
                source.write(sql.encode()); source.seek(0)
                backup.docker("exec", "-i", name, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "member", "-d", "member", stdin=source)
            with tempfile.TemporaryDirectory(prefix="member-backup-test-") as folder:
                archive = backup.backup(name, "member", "member", folder)
                self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
                info = json.loads(archive.with_suffix(".json").read_text())
                self.assertEqual(info["sha256"], backup.digest(archive))
                rows = {row["table"]: row["rows"] for row in backup.restore_check(archive, "SELECT backup_assert();")}
                self.assertEqual(rows["backup_record"], 2)
                self.assertEqual(rows["backup_owner"], 2)
                self.assertIn("WorkoutSession", rows)
                self.assertIn("ImportTarget", rows)
                # Corrupt archive is rejected before any restore container starts.
                with archive.open("ab") as stream:
                    stream.write(b"corrupt")
                with self.assertRaises(ValueError):
                    backup.restore_check(archive)
                before = set(Path(folder).iterdir())
                with self.assertRaises(subprocess.CalledProcessError):
                    backup.backup(name, "missing_database", "member", folder)
                self.assertEqual(set(Path(folder).iterdir()), before)
                self.assertFalse(list(Path(folder).glob("*.partial")))
                # Existing permissive directories are rejected rather than exposed.
                Path(folder).chmod(0o755)
                with self.assertRaises(ValueError):
                    backup.backup(name, "member", "member", folder)
                Path(folder).chmod(0o700)
        finally:
            backup.docker("rm", "-f", name)


if __name__ == "__main__":
    unittest.main()
