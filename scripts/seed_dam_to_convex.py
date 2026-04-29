#!/usr/bin/env python3
"""Seed local HEnEx/ENEX DAM XLSX data into Convex.

The ENEX XLSX files in this repo report worksheet dimension A1 even when
full rows exist, so this script streams the underlying XLSX XML directly
instead of relying on spreadsheet library dimension metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
import sys
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo
from xml.etree import ElementTree


REPO_ROOT = Path(__file__).resolve().parents[1]
DAM_ROOT = REPO_ROOT / "data" / "dam"
MANIFEST_PATH = DAM_ROOT / "manifest.json"
ATHENS = ZoneInfo("Europe/Athens")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SUPPORTED_SOURCES = {"Results", "AggrCurves"}
SOURCE_MUTATIONS = {
    "Results": "dam:storeDamMarketResultsBatch",
    "AggrCurves": "dam:storeDamAggregatedCurvesBatch",
}


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class ParsedFile:
    file_record: dict[str, Any]
    rows: list[dict[str, Any]]
    source_code: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed local ENEX DAM XLSX files into Convex.")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH, help="Path to data/dam/manifest.json.")
    parser.add_argument("--from", dest="from_date", help="Inclusive market date filter, YYYY-MM-DD.")
    parser.add_argument("--to", dest="to_date", help="Inclusive market date filter, YYYY-MM-DD.")
    parser.add_argument(
        "--sources",
        default="Results,AggrCurves",
        help="Comma-separated source codes to seed. Phase 1 supports Results,AggrCurves.",
    )
    parser.add_argument("--batch-size", type=int, default=100, help="Rows per Convex mutation call.")
    parser.add_argument("--limit-files", type=int, help="Stop after N matching files, useful for smoke tests.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and summarize without calling Convex.")
    parser.add_argument("--push", action="store_true", help="Push Convex code before the first Convex run call.")
    parser.add_argument("--prod", action="store_true", help="Pass --prod to convex run.")
    parser.add_argument(
        "--convex-command",
        default="npx convex",
        help="Command prefix used to invoke Convex CLI, for example 'npx convex'.",
    )
    parser.add_argument("--quiet", action="store_true", help="Reduce per-file progress output.")
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 500:
        parser.error("--batch-size must be between 1 and 500")
    return args


def require_date_key(value: str | None, name: str) -> str | None:
    if value is None:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise SystemExit(f"{name} must use YYYY-MM-DD format") from exc
    return value


def source_list(raw: str) -> set[str]:
    sources = {item.strip() for item in raw.split(",") if item.strip()}
    unsupported = sources - SUPPORTED_SOURCES
    if unsupported:
        raise SystemExit(f"Unsupported phase 1 source(s): {', '.join(sorted(unsupported))}")
    return sources


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Manifest not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def selected_assets(manifest: dict[str, Any], sources: set[str], from_date: str | None, to_date: str | None) -> list[dict[str, Any]]:
    assets = []
    for asset in manifest.get("assets", []):
        source_code = asset.get("source_code")
        market_date = normalize_market_date(asset.get("market_date"))
        if source_code not in sources:
            continue
        if from_date and market_date < from_date:
            continue
        if to_date and market_date > to_date:
            continue
        assets.append(asset)
    return sorted(assets, key=lambda item: (normalize_market_date(item.get("market_date")), item.get("source_code", "")))


def normalize_market_date(value: Any) -> str:
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    if len(text) >= 10:
        return text[:10]
    raise ValueError(f"Unsupported market date: {value!r}")


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        payload = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ElementTree.fromstring(payload)
    strings: list[str] = []
    for item in root.findall(f"{NS}si"):
        strings.append("".join(text.text or "" for text in item.iter(f"{NS}t")))
    return strings


def first_sheet_path(archive: zipfile.ZipFile) -> str:
    names = sorted(name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
    if not names:
        raise ValueError("Workbook has no worksheet XML")
    return names[0]


def first_sheet_name(archive: zipfile.ZipFile) -> str | None:
    try:
        root = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    except KeyError:
        return None
    sheet = root.find(f"{NS}sheets/{NS}sheet")
    return sheet.attrib.get("name") if sheet is not None else None


def column_index(cell_ref: str) -> int:
    letters = ""
    for char in cell_ref:
        if char.isalpha():
            letters += char.upper()
        else:
            break
    value = 0
    for char in letters:
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def parse_number(text: str) -> int | float:
    number = float(text)
    return int(number) if number.is_integer() else number


def cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.attrib.get("t")
    value_node = cell.find(f"{NS}v")
    if cell_type == "inlineStr":
        return "".join(text.text or "" for text in cell.iter(f"{NS}t"))
    if value_node is None or value_node.text is None:
        return None
    text = value_node.text
    if cell_type == "s":
        index = int(text)
        return shared_strings[index] if index < len(shared_strings) else text
    if cell_type == "b":
        return text == "1"
    if cell_type in (None, "n"):
        return parse_number(text)
    return text


def iter_xlsx_rows(path: Path) -> tuple[str | None, Iterable[list[Any]]]:
    archive = zipfile.ZipFile(path)
    shared_strings = read_shared_strings(archive)
    sheet_path = first_sheet_path(archive)
    sheet_name = first_sheet_name(archive)

    def rows() -> Iterable[list[Any]]:
        with archive.open(sheet_path) as sheet:
            for _event, elem in ElementTree.iterparse(sheet, events=("end",)):
                if elem.tag != f"{NS}row":
                    continue
                values: list[Any] = []
                for cell in elem.findall(f"{NS}c"):
                    ref = cell.attrib.get("r", "")
                    index = column_index(ref)
                    while len(values) <= index:
                        values.append(None)
                    values[index] = cell_value(cell, shared_strings)
                elem.clear()
                yield values
        archive.close()

    return sheet_name, rows()


def string_value(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def number_value(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def int_value(value: Any) -> int | None:
    number = number_value(value)
    return int(number) if number is not None else None


def parse_local_timestamp(value: Any) -> str | None:
    text = string_value(value)
    if text is None:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.replace(tzinfo=ATHENS).isoformat()
        except ValueError:
            continue
    return text


def raw_row(headers: list[str], values: list[Any]) -> dict[str, Any]:
    row: dict[str, Any] = {}
    for index, header in enumerate(headers):
        if not header:
            continue
        value = values[index] if index < len(values) else None
        if value is not None:
            row[header] = value
    return row


def stable_hash(parts: dict[str, Any]) -> str:
    payload = json.dumps(parts, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_result_row(asset: dict[str, Any], sheet_name: str | None, row_number: int, headers: list[str], values: list[Any]) -> dict[str, Any]:
    row = raw_row(headers, values)
    source_file = asset["filename"]
    market_date = normalize_market_date(row.get("DDAY") or asset["market_date"])
    normalized = {
        "marketDate": market_date,
        "timestamp": parse_local_timestamp(row.get("DELIVERY_MTU")) or f"{market_date}T00:00:00",
        "mtu": int_value(row.get("SORT")) or row_number - 1,
        "target": string_value(row.get("TARGET")) or "DAM",
        "sourceCode": "Results",
        "sourceFile": source_file,
        "biddingZone": string_value(row.get("BIDDING_ZONE_DESCR")),
        "side": string_value(row.get("SIDE_DESCR")),
        "asset": string_value(row.get("ASSET_DESCR")),
        "classification": string_value(row.get("CLASSIFICATION")),
        "deliveryDurationMinutes": number_value(row.get("DELIVERY_DURATION")),
        "mcpEurPerMwh": number_value(row.get("MCP")),
        "totalTrades": number_value(row.get("TOTAL_TRADES")),
        "pubTime": parse_local_timestamp(row.get("PUB_TIME")),
        "version": number_value(row.get("VER")),
        "sheetName": sheet_name,
        "row": row,
    }
    normalized["rowHash"] = stable_hash({"sourceFile": source_file, "rowNumber": row_number, "row": row})
    return {key: value for key, value in normalized.items() if value is not None}


def normalize_curve_row(asset: dict[str, Any], sheet_name: str | None, row_number: int, headers: list[str], values: list[Any]) -> dict[str, Any]:
    row = raw_row(headers, values)
    source_file = asset["filename"]
    market_date = normalize_market_date(row.get("DDAY") or asset["market_date"])
    normalized = {
        "marketDate": market_date,
        "timestamp": parse_local_timestamp(row.get("DELIVERY_MTU")) or f"{market_date}T00:00:00",
        "mtu": int_value(row.get("SORT")) or row_number - 1,
        "target": string_value(row.get("TARGET")) or "DAM",
        "sourceCode": "AggrCurves",
        "sourceFile": source_file,
        "side": string_value(row.get("SIDE_DESCR")),
        "deliveryDurationMinutes": number_value(row.get("DELIVERY_DURATION")),
        "pointOrder": number_value(row.get("AA")),
        "quantity": number_value(row.get("QUANTITY")),
        "unitPriceEurPerMwh": number_value(row.get("UNITPRICE")),
        "pubTime": parse_local_timestamp(row.get("PUB_TIME")),
        "version": number_value(row.get("VER")),
        "sheetName": sheet_name,
        "row": row,
    }
    normalized["rowHash"] = stable_hash({"sourceFile": source_file, "rowNumber": row_number, "row": row})
    return {key: value for key, value in normalized.items() if value is not None}


def parse_file(asset: dict[str, Any]) -> ParsedFile:
    path = REPO_ROOT / asset["output_path"]
    if not path.exists():
        raise FileNotFoundError(path)
    source_code = asset["source_code"]
    sheet_name, rows_iter = iter_xlsx_rows(path)
    iterator = iter(rows_iter)
    headers = [str(value).strip() if value is not None else "" for value in next(iterator)]
    parsed_rows = []
    normalizer = normalize_result_row if source_code == "Results" else normalize_curve_row
    for row_number, values in enumerate(iterator, start=2):
        if not any(value is not None for value in values):
            continue
        parsed_rows.append(normalizer(asset, sheet_name, row_number, headers, values))
    parsed_at = utc_now_iso()
    file_record = {
        "sourceCode": source_code,
        "sourceTitle": asset["source_title"],
        "marketDate": normalize_market_date(asset["market_date"]),
        "filename": asset["filename"],
        "extension": asset["extension"],
        "sourceUrl": asset["url"],
        "localPath": asset["output_path"],
        "bytes": int(asset["bytes"]),
        "sha256": asset["sha256"],
        "parsedAtUtc": parsed_at,
        "rowCount": len(parsed_rows),
        "status": "parsed",
    }
    return ParsedFile(file_record=file_record, rows=parsed_rows, source_code=source_code)


def chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def convex_run(args: argparse.Namespace, function_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    command = shlex.split(args.convex_command) + ["run"]
    use_push = bool(args.push and not getattr(args, "_convex_pushed", False))
    if use_push:
        command.append("--push")
    if args.prod:
        command.append("--prod")
    command.extend([function_name, json.dumps(payload, separators=(",", ":"), ensure_ascii=False)])
    result = subprocess.run(command, cwd=REPO_ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"Convex command failed for {function_name}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    if use_push:
        setattr(args, "_convex_pushed", True)
    text = result.stdout.strip()
    if not text:
        return {}
    json_start = text.rfind("\n{")
    candidate = text[json_start + 1 :] if json_start != -1 else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return {"stdout": text}


def empty_run_record(run_id: str, args: argparse.Namespace, status: str) -> dict[str, Any]:
    return {
        "runId": run_id,
        "startedAtUtc": utc_now_iso(),
        "sources": sorted(source_list(args.sources)),
        "fromDate": args.from_date,
        "toDate": args.to_date,
        "dryRun": bool(args.dry_run),
        "status": status,
        "filesParsed": 0,
        "filesInserted": 0,
        "filesSkipped": 0,
        "rowsParsed": 0,
        "rowsInserted": 0,
        "rowsSkipped": 0,
        "failedFiles": 0,
        "errors": [],
    }


def main() -> int:
    args = parse_args()
    args.from_date = require_date_key(args.from_date, "--from")
    args.to_date = require_date_key(args.to_date, "--to")
    sources = source_list(args.sources)
    manifest = load_manifest(args.manifest)
    assets = selected_assets(manifest, sources, args.from_date, args.to_date)
    if args.limit_files is not None:
        assets = assets[: args.limit_files]
    run_id = f"dam-seed-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    run = empty_run_record(run_id, args, "running")

    if not args.dry_run:
        convex_run(args, "dam:recordDamIngestRun", run)

    for asset in assets:
        try:
            parsed = parse_file(asset)
        except Exception as exc:  # noqa: BLE001 - CLI should continue and report failed files.
            run["failedFiles"] += 1
            run["errors"].append({"file": asset.get("filename"), "error": str(exc)})
            print(f"failed {asset.get('filename')}: {exc}", file=sys.stderr)
            continue

        run["filesParsed"] += 1
        run["rowsParsed"] += len(parsed.rows)
        if not args.quiet:
            print(f"parsed {parsed.file_record['filename']}: {len(parsed.rows)} rows")

        if args.dry_run:
            continue

        file_result = convex_run(args, "dam:storeDamFileBatch", {"files": [parsed.file_record]})
        run["filesInserted"] += int(file_result.get("inserted", 0))
        run["filesSkipped"] += int(file_result.get("skipped", 0))

        mutation = SOURCE_MUTATIONS[parsed.source_code]
        for batch in chunks(parsed.rows, args.batch_size):
            result = convex_run(args, mutation, {"rows": batch})
            run["rowsInserted"] += int(result.get("inserted", 0))
            run["rowsSkipped"] += int(result.get("skipped", 0))

    run["completedAtUtc"] = utc_now_iso()
    run["status"] = "completed" if run["failedFiles"] == 0 else "completed_with_errors"

    if not args.dry_run:
        convex_run(args, "dam:recordDamIngestRun", run)

    print(json.dumps(run, indent=2, sort_keys=True))
    return 0 if run["failedFiles"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
