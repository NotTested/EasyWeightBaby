#!/usr/bin/env python3
"""Read-only, bounded Notion export staging. Never imports DB clients or executes pages."""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import stat
import zipfile
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

GROUPS = {"01 운동 종목": ("exercises", "종목명"), "01 운동 종목 (1)": ("exercise_clones", "종목명"),
          "02 주간 루틴": ("routines", "루틴 항목"), "03 운동 세션": ("sessions", "세션명"), "04 수행 기록": ("logs", "기록명")}
PAGE = re.compile(r"^(.*) ([0-9a-fA-F]{32})\.(md|csv)$")
LINK = re.compile(r"([^/()\n]*?) ([0-9a-fA-F]{32})\.(?:md|csv)")
LIMIT = 32 * 1024 * 1024


def archive_entries(path):
    if Path(path).stat().st_size > LIMIT:
        raise ValueError("ZIP exceeds 32 MiB")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 2000 or sum(e.file_size for e in entries) > LIMIT:
            raise ValueError("Archive entry/expanded size limit exceeded")
        result = {}
        for entry in entries:
            name = entry.filename
            decoded = unquote(name)
            parts = PurePosixPath(decoded).parts
            if (decoded.startswith(("/", "\\")) or "\\" in decoded or ".." in parts or
                    re.match(r"^[A-Za-z]:", decoded) or stat.S_ISLNK(entry.external_attr >> 16)):
                raise ValueError("Unsafe ZIP path")
            if entry.is_dir():
                continue
            if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError("Unsupported ZIP compression")
            if name.lower().endswith(".zip"):
                raise ValueError("Nested ZIP is unsupported")
            if name in result or entry.flag_bits & 1 or entry.file_size > 2 * 1024 * 1024:
                raise ValueError("Duplicate/encrypted/oversize archive entry")
            if entry.file_size > max(1, entry.compress_size) * 500:
                raise ValueError("Archive expansion ratio exceeded")
            # Reading validates CRC; no extraction, nested archives or document commands.
            result[name] = archive.read(entry)
        return result


def relation_ids(value):
    return list(dict.fromkeys(m.group(2).lower() for m in LINK.finditer(unquote(value))))


def preview(path):
    entries = archive_entries(path)
    issues = []
    def issue(code, source, severity="review", **details):
        issues.append({"code": code, "source": source, "severity": severity, **details})
    pages = defaultdict(list)
    for name, data in entries.items():
        match = PAGE.match(PurePosixPath(name).name)
        if match and match[3] == "md":
            group = GROUPS.get(PurePosixPath(name).parent.name)
            if group:
                text = data.decode("utf-8-sig")
                pages[(group[0], match[1])].append((match[2].lower(), name, text))
    inventory, tables = [], defaultdict(list)
    for name, data in entries.items():
        if not name.endswith(".csv"):
            continue
        text = data.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)):
            raise ValueError("Duplicate CSV headers")
        rows = list(reader)
        if len(rows) > 10000 or any(None in row or any(v is None for v in row.values()) for row in rows):
            raise ValueError("Invalid CSV row shape or row limit")
        stem = PurePosixPath(name).stem
        all_view = stem.endswith("_all")
        match = PAGE.match((stem[:-4] if all_view else stem) + ".csv")
        group = GROUPS.get(match[1]) if match else None
        inventory.append({"path": name, "rows": len(rows), "headers": headers, "group": group[0] if group else None})
        if group:
            if group[1] not in headers:
                raise ValueError("Missing primary title column")
            tables[group[0]].append((all_view, name, rows))
    records = {group[0]: [] for group in GROUPS.values()}
    skipped_views = []
    for group, views in tables.items():
        # Full canonical view; deterministic ties are reported, not silently combined.
        views.sort(key=lambda v: (not v[0], v[1]))
        canonical = views[0]
        if sum(v[0] for v in views) > 1:
            issue("multiple_full_views", group, "error")
        title_key = next(v[1] for v in GROUPS.values() if v[0] == group)
        seen = {}
        for row_number, row in enumerate(canonical[2], 2):
            source = {"csv": canonical[1], "row": row_number}
            matches = pages.get((group, row[title_key]), [])
            ids = {m[0] for m in matches}
            notion_id = next(iter(ids)) if len(ids) == 1 else None
            if notion_id is None:
                issue("missing_or_ambiguous_page_id", source, candidates=sorted(ids))
            item = {"notionId": notion_id, "title": row[title_key], "source": source, "raw": row,
                    "pages": [{"path": m[1], "markdown": m[2]} for m in matches]}
            if notion_id in seen and notion_id is not None:
                if seen[notion_id]["raw"] != row:
                    issue("conflicting_duplicate_id", source, "error", notionId=notion_id)
                    records[group].append(item)  # retain both variants for review
                else:
                    issue("duplicate_id_row", source, "info", notionId=notion_id)
                continue
            if notion_id:
                seen[notion_id] = item
            records[group].append(item)
        for _, view_name, rows in views[1:]:
            skipped_views.append(view_name)
            by_title = defaultdict(list)
            for item in records[group]:
                by_title[item["title"]].append(item)
            for row_number, row in enumerate(rows, 2):
                candidates = by_title[row[title_key]]
                def equal(candidate):
                    return all(candidate["raw"].get(k) == v or
                               (relation_ids(v) and relation_ids(v) == relation_ids(candidate["raw"].get(k, ""))) for k, v in row.items())
                if not any(equal(candidate) for candidate in candidates):
                    issue("csv_view_conflict", {"csv": view_name, "row": row_number}, "error", raw=row)
    for required in ("exercises", "routines", "sessions", "logs"):
        if not tables.get(required):
            issue("missing_table", required, "error")
    id_index = {}
    for group, items in records.items():
        for item in items:
            if item["notionId"]:
                previous = id_index.get(item["notionId"])
                if previous and previous != group:
                    issue("id_reused_across_tables", item["source"], "error")
                id_index[item["notionId"]] = group
    def number(item, key):
        raw = item["raw"].get(key, "")
        if not raw.strip():
            return None
        try:
            if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?", raw.strip()):
                raise InvalidOperation()
            value = Decimal(raw.replace(",", ""))
            if not value.is_finite() or value < 0:
                raise InvalidOperation()
            return value
        except InvalidOperation:
            issue("invalid_number", item["source"], "error", field=key, value=raw)
            return None
    def numeric(value):
        return None if value is None else str(value)
    def local_date(item, key):
        raw = item["raw"].get(key, "")
        if not raw.strip():
            issue("missing_date", item["source"], "error", field=key)
            return None
        match = re.fullmatch(r"(\d{4})년 (\d{1,2})월 (\d{1,2})일", raw)
        try:
            return (date(*map(int, match.groups())) if match else date.fromisoformat(raw)).isoformat()
        except ValueError:
            issue("invalid_date", item["source"], "error", field=key, value=raw)
            return None
    for group, items in records.items():
        for item in items:
            relations = {}
            expected = {"routines": {"종목": "exercises"}, "logs": {"종목": "exercises", "세션": "sessions"}, "sessions": {"수행 기록": "logs"}}.get(group, {})
            for field, target in expected.items():
                ids = relation_ids(item["raw"].get(field, "")); relations[field] = ids
                if field != "수행 기록" and len(ids) != 1:
                    issue("relation_cardinality", item["source"], "error", field=field, ids=ids)
                for target_id in ids:
                    if id_index.get(target_id) != target:
                        issue("unresolved_relation", item["source"], "error", field=field, targetId=target_id)
            item["relations"] = relations
            row = item["raw"]
            if group in ("sessions", "logs"):
                kind = {"실제": "actual", "테스트": "test", "계획": "plan"}.get(row.get("기록 구분"))
                item["recordKind"] = kind
                if kind is None:
                    issue("unknown_record_kind", item["source"], "error")
                item["localDate"] = local_date(item, "운동 날짜" if group == "sessions" else "수행 날짜")
            if group in ("exercises", "exercise_clones"):
                mappings = {"equipment": ("도구", {"덤벨": "dumbbell", "덤벨+벤치": "dumbbell_bench", "맨몸": "bodyweight", "AB 휠": "ab_wheel"}),
                            "execution": ("수행방식", {"맨몸": "bodyweight", "양측 동시": "bilateral", "좌우 교대": "alternating"}),
                            "measurement": ("측정방식", {"반복": "reps"}),
                            "category": ("분류", dict(zip(["가슴", "등", "어깨", "코어", "팔", "하체"], ["chest", "back", "shoulders", "core", "arms", "legs"]))),
                            "active": ("활성", {"Yes": True, "No": False})}
                item["candidate"] = {"name": item["title"], "benchAngle": row.get("기본 벤치 각도"), "notes": row.get("운동 메모")}
                for target, (field, mapping) in mappings.items():
                    item["candidate"][target] = mapping.get(row.get(field))
                    if row.get(field) not in mapping:
                        issue("unmapped_exercise_field", item["source"], field=field, value=row.get(field))
            if group == "routines":
                item["candidate"] = {"weekday": dict(zip("월화수목금토일", range(7))).get(row.get("요일")),
                    "position": numeric(number(item, "수행순서")), "sets": numeric(number(item, "목표 세트")),
                    "minReps": numeric(number(item, "목표 최소반복")), "maxReps": numeric(number(item, "목표 최대반복")),
                    "benchAngle": row.get("벤치 각도"), "notes": row.get("메모"), "active": {"Yes": True, "No": False}.get(row.get("활성"))}
                if item["candidate"]["weekday"] is None:
                    issue("unknown_weekday", item["source"], "error")
            if group in ("sessions", "logs") and item.get("recordKind") != "actual":
                issue("record_kind_model_gap", item["source"], reason="현재 앱 모델의 실제/계획/테스트 구분을 보완하기 전 적재 금지")
            if group == "sessions":
                item["status"] = {"완료": "completed", "진행 중": "in_progress", "계획": "planned"}.get(row.get("진행 상태"))
                if item["status"] is None:
                    issue("unknown_session_status", item["source"], "error", value=row.get("진행 상태"))
                item["cardioCandidate"] = {"activity": row.get("유산소 종류"), "durationMinutes": numeric(number(item, "유산소 시간(분)")), "intensity": row.get("유산소 강도"), "completed": None}
                if row.get("유산소 시간(분)"):
                    issue("cardio_source_review", item["source"], reason="종류 속성과 메모 대조 및 수행 여부 확인 필요")
            if group == "logs":
                slots = []
                base = number(item, "중량(개당 kg)")
                for position in range(1, 5):
                    reps = number(item, f"{position}세트")
                    override = number(item, f"{position}세트 중량(개당 kg)") if position > 1 else None
                    if reps is not None and (reps != reps.to_integral_value() or reps > 1000):
                        issue("invalid_reps", item["source"], "error", slot=position)
                    if reps is None and override is not None:
                        issue("weight_without_reps", item["source"], slot=position)
                    if reps is not None:
                        slots.append({"sourceSlot": position, "reps": numeric(reps), "weightKg": numeric(override if override is not None else base), "weightSource": "override" if override is not None else "base", "completed": None, "side": "unspecified"})
                count, sides = number(item, "사용 덤벨 수"), number(item, "측수")
                rir, correction = number(item, "마지막 세트 RIR"), number(item, "실제총반복 보정")
                item["setSlots"] = slots
                if rir is not None and (rir > 10 or rir != rir.to_integral_value()):
                    issue("invalid_rir", item["source"], "error")
                item["lastRir"] = numeric(rir)
                item["lastRirCandidateSlot"] = slots[-1]["sourceSlot"] if slots else None
                if rir is not None or slots:
                    issue("performed_set_review", item["source"], reason="수행/본세트 및 마지막 RIR 연결은 원문 대조 후 확정")
                if sides is not None and sides > 1:
                    issue("side_distribution_review", item["source"], reason="측수로 좌우 반복을 자동 분배하지 않음")
                if correction is not None:
                    issue("total_reps_correction_review", item["source"], value=numeric(correction))
                if "불가리안" in item["title"]:
                    issue("dumbbell_count_review", item["source"], reason="원본 메모의 임시 해석 확인 필요")
                volume = None
                if count is not None and sides is not None and all(s["weightKg"] is not None for s in slots) and slots:
                    volume = sum(Decimal(s["weightKg"]) * Decimal(s["reps"]) for s in slots) * count * sides
                item["nominalVolumeKg"] = numeric(volume)
                original = number(item, "볼륨(kg)")
                if volume is not None and original is not None and volume != original:
                    issue("volume_mismatch", item["source"], calculated=numeric(volume), original=numeric(original))
    session_index = {r["notionId"]: r for r in records["sessions"] if r["notionId"]}
    for log in records["logs"]:
        for target in log["relations"].get("세션", []):
            session = session_index.get(target)
            if session and (session.get("localDate") != log.get("localDate") or session.get("recordKind") != log.get("recordKind")):
                issue("session_log_metadata_mismatch", log["source"], "error", sessionId=target)
            if session and session["relations"].get("수행 기록") and log["notionId"] not in session["relations"]["수행 기록"]:
                issue("session_backlink_mismatch", log["source"], "error", sessionId=target)
    # Names suggest matches, never authorize an ID merge.
    names = defaultdict(list)
    for group in ("exercises", "exercise_clones"):
        for item in records[group]:
            names[item["title"]].append({"group": group, "notionId": item["notionId"], "source": item["source"]})
    candidates = [{"name": name, "items": values} for name, values in names.items() if len(values) > 1]
    actual_sessions = [r for r in records["sessions"] if r.get("recordKind") == "actual"]
    actual_logs = [r for r in records["logs"] if r.get("recordKind") == "actual"]
    summary = {"schemaVersion": 1, "mode": "preview_only", "canApply": False, "archiveSha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
               "counts": {k: len(v) for k, v in records.items()}, "identified": {k: sum(r["notionId"] is not None for r in v) for k, v in records.items()},
               "activeExercises": sum(r["candidate"]["active"] is True for r in records["exercises"]), "actualSessions": len(actual_sessions), "actualSessionStates": dict(Counter(r["status"] for r in actual_sessions)),
               "actualLogs": len(actual_logs), "actualSetSlots": sum(len(r["setSlots"]) for r in actual_logs),
               "testSessions": sum(r.get("recordKind") == "test" for r in records["sessions"]), "testLogs": sum(r.get("recordKind") == "test" for r in records["logs"]),
               "issueCounts": dict(Counter(i["code"] for i in issues)), "errors": sum(i["severity"] == "error" for i in issues), "skippedViews": skipped_views,
               "cloneCandidateGroups": len(candidates), "inventory": inventory}
    return summary, {"summary": summary, "records": records, "cloneCandidates": candidates, "issues": issues}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        summary, staging = preview(args.archive)
        args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
        paths = [args.output / "summary.json", args.output / "staging.json"]
        if any(p.exists() for p in paths):
            raise ValueError("Output already exists; choose a new directory")
        for target, value in zip(paths, [summary, staging]):
            with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8") as handle:
                json.dump(value, handle, ensure_ascii=False, indent=2)
        print(json.dumps({"counts": summary["counts"], "errors": summary["errors"], "output": str(args.output)}, ensure_ascii=False))
        return 2 if summary["errors"] else 0
    except (ValueError, OSError, UnicodeError, zipfile.BadZipFile, csv.Error) as error:
        parser.exit(1, f"Preview failed: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
