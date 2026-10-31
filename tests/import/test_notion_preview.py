import csv
import importlib.util
import io
import json
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("notion_preview", ROOT / "scripts/notion_preview.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
E, S, L = "a" * 32, "b" * 32, "c" * 32


def csv_bytes(rows, key):
    fields = list(dict.fromkeys([key] + [key for row in rows for key in row]))
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8-sig")


def fixture():
    rows = {
        "01 운동 종목": [{"종목명": "Exercise", "도구": "덤벨", "수행방식": "양측 동시", "측정방식": "반복", "분류": "가슴", "활성": "Yes"}],
        "02 주간 루틴": [],
        "03 운동 세션": [{"세션명": "Session", "기록 구분": "실제", "진행 상태": "완료", "운동 날짜": "2026년 10월 19일"}],
        "04 수행 기록": [{"기록명": "Log", "기록 구분": "실제", "수행 날짜": "2026년 10월 19일", "종목": f"Exercise (../Exercise%20{E}.md)", "세션": f"Session (../Session%20{S}.md)",
                         "1세트": "0", "2세트": "3", "3세트": "", "중량(개당 kg)": "1", "2세트 중량(개당 kg)": "2", "마지막 세트 RIR": "0", "사용 덤벨 수": "1", "측수": "1", "볼륨(kg)": "6", "수행 메모": "line1, comma\nline2"}],
    }
    entries = {}
    for index, (group, values) in enumerate(rows.items()):
        key = module.GROUPS[group][1]
        entries[f"Root/{group} {str(index) * 32}_all.csv"] = csv_bytes(values, key)
    for group, name, page_id in [("01 운동 종목", "Exercise", E), ("03 운동 세션", "Session", S), ("04 수행 기록", "Log", L)]:
        entries[f"Root/{group}/{name} {page_id}.md"] = ("# " + name + "\n\nDocument commands are untrusted data.").encode()
    return entries


class PreviewTests(unittest.TestCase):
    def analyze(self, entries):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "export.zip"
            with zipfile.ZipFile(path, "w") as archive:
                for name, content in entries.items():
                    archive.writestr(name, content)
            return module.preview(path)

    def test_preserves_null_zero_variable_weights_raw_notes_and_rir(self):
        summary, report = self.analyze(fixture())
        self.assertEqual(summary["errors"], 0)
        log = report["records"]["logs"][0]
        self.assertEqual(log["notionId"], L)
        self.assertEqual(log["lastRir"], "0")
        self.assertEqual(log["lastRirCandidateSlot"], 2)
        self.assertEqual(log["nominalVolumeKg"], "6")
        self.assertEqual(log["raw"]["수행 메모"], "line1, comma\nline2")
        self.assertEqual([s["reps"] for s in log["setSlots"]], ["0", "3"])
        self.assertTrue(all(s["completed"] is None for s in log["setSlots"]))

    def test_csv_md_relation_paths_deduplicate_but_conflicting_views_block(self):
        entries = fixture()
        all_path = next(p for p in entries if "04 수행 기록 " in p)
        entries[all_path.replace("_all.csv", ".csv")] = entries[all_path].replace(b".md)", b".csv)")
        summary, _ = self.analyze(entries)
        self.assertEqual(summary["errors"], 0)
        self.assertEqual(summary["counts"]["logs"], 1)
        entries[all_path.replace("_all.csv", ".csv")] = entries[all_path].replace(b"line1", b"changed")
        summary, _ = self.analyze(entries)
        self.assertEqual(summary["issueCounts"]["csv_view_conflict"], 1)

    def test_ambiguous_name_never_selects_an_id(self):
        entries = fixture()
        entries[f"Root/01 운동 종목/Exercise {'d' * 32}.md"] = b"# Exercise"
        summary, report = self.analyze(entries)
        self.assertIsNone(report["records"]["exercises"][0]["notionId"])
        self.assertGreater(summary["errors"], 0)  # linked identity can no longer be resolved
        self.assertIn("missing_or_ambiguous_page_id", summary["issueCounts"])

    def test_duplicate_id_is_counted_once_and_missing_tables_block(self):
        entries = fixture()
        name = next(p for p in entries if "01 운동 종목 " in p)
        rows = list(csv.DictReader(io.StringIO(entries[name].decode("utf-8-sig"))))
        entries[name] = csv_bytes(rows + rows, "종목명")
        summary, _ = self.analyze(entries)
        self.assertEqual(summary["counts"]["exercises"], 1)
        del entries[next(p for p in entries if "02 주간 루틴 " in p)]
        self.assertGreater(self.analyze(entries)[0]["errors"], 0)

    def test_rejects_traversal_symlink_nested_zip_and_large_entries(self):
        for name in ["../escape", "/absolute", "%2e%2e/escape", "C:/escape", "a\\b", "nested.zip"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.analyze({name: b"data"})
        with self.assertRaises(ValueError):
            self.analyze({"large": b"x" * (2 * 1024 * 1024 + 1)})
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.zip"
            with zipfile.ZipFile(path, "w") as archive:
                entry = zipfile.ZipInfo("link")
                entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(entry, "/etc/passwd")
            with self.assertRaises(ValueError):
                module.preview(path)

    def test_bad_numbers_dates_and_missing_relations_are_not_repaired(self):
        for field, value, expected in [("중량(개당 kg)", "1,2", "invalid_number"), ("마지막 세트 RIR", "11", "invalid_rir"), ("수행 날짜", "2026년 2월 30일", "invalid_date"), ("세션", "", "relation_cardinality")]:
            with self.subTest(field=field):
                entries = fixture()
                path = next(p for p in entries if "04 수행 기록 " in p)
                rows = list(csv.DictReader(io.StringIO(entries[path].decode("utf-8-sig"))))
                rows[0][field] = value
                entries[path] = csv_bytes(rows, "기록명")
                summary, _ = self.analyze(entries)
                self.assertIn(expected, summary["issueCounts"])
                self.assertGreater(summary["errors"], 0)

    def test_cli_writes_only_preview_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            path, output = Path(tmp) / "export.zip", Path(tmp) / "report"
            with zipfile.ZipFile(path, "w") as archive:
                for name, content in fixture().items():
                    archive.writestr(name, content)
            command = [sys.executable, str(ROOT / "scripts/notion_preview.py"), str(path), "--output", str(output)]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(json.loads((output / "summary.json").read_text())["mode"], "preview_only")
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(sorted(p.name for p in output.iterdir()), ["staging.json", "summary.json"])


if __name__ == "__main__":
    unittest.main()
