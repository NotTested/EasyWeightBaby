import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
import hashlib

spec = importlib.util.spec_from_file_location("operations", Path(__file__).resolve().parents[2] / "scripts/check-operations.py")
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


class OperationsTest(unittest.TestCase):
    def services(self):
        return [dict(service=name, status="exited" if name == "migrate" else "running", exitCode=0,
                     health=None if name == "migrate" else "healthy", restarts=0, oomKilled=False)
                for name in ("db", "migrate", "app")]

    def test_runtime_and_completed_migration(self):
        self.assertEqual(ops.evaluate_services(self.services()), ([], []))

    def test_missing_duplicate_unhealthy_migration_and_oom(self):
        services = self.services()
        self.assertTrue(ops.evaluate_services(services[:-1])[0])
        self.assertTrue(ops.evaluate_services(services + [services[-1]])[0])
        for index, key, value in [(0, "health", "unhealthy"), (1, "exitCode", 1),
                                  (1, "status", "running"), (2, "oomKilled", True)]:
            with self.subTest(key=key, value=value):
                changed = self.services(); changed[index][key] = value
                self.assertTrue(ops.evaluate_services(changed)[0])
        services[-1]["restarts"] = 2
        issues, warnings = ops.evaluate_services(services)
        self.assertFalse(issues); self.assertTrue(warnings)

    def test_backup_age_checksum_permissions_and_missing_pair(self):
        now = datetime.now(timezone.utc)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaises(ValueError):
                ops.check_backup(root, 26, now)
            archive = root / "member-20261031T000000Z-test.dump"
            archive.write_bytes(b"PGDMP-test"); archive.chmod(0o600)
            manifest = archive.with_suffix(".json")
            info = dict(format=1, postgresMajor=17, archive=archive.name, bytes=archive.stat().st_size,
                        sha256=hashlib.sha256(archive.read_bytes()).hexdigest(), createdAt=now.isoformat())
            def write():
                manifest.write_text(json.dumps(info)); manifest.chmod(0o600)
            write()
            self.assertEqual(ops.check_backup(root, 26, now)["status"], "checksum-and-age-ok")
            for stamp in [now - timedelta(hours=27), now + timedelta(hours=1)]:
                info["createdAt"] = stamp.isoformat(); write()
                with self.assertRaises(ValueError):
                    ops.check_backup(root, 26, now)
            info["createdAt"] = now.isoformat(); write()
            archive.chmod(0o644)
            with self.assertRaises(ValueError):
                ops.check_backup(root, 26, now)
            archive.chmod(0o600); archive.write_bytes(b"PGDMP-fail")
            with self.assertRaises(ValueError):
                ops.check_backup(root, 26, now)
            archive.unlink()
            with self.assertRaises(OSError):
                ops.check_backup(root, 26, now)


if __name__ == "__main__":
    unittest.main()
