#!/usr/bin/env python3
"""Bulk import compact HEnEx/ENEX DAM Results data into Convex.

This script does not call Convex mutations row-by-row. It parses local Results
workbooks, writes JSONL import files, then uses `npx convex import --replace`
for the compact DAM tables.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import subprocess
import zipfile
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo
from xml.etree import ElementTree


REPO_ROOT = Path(__file__).resolve().parents[1]
DAM_ROOT = REPO_ROOT / "data" / "dam"
MANIFEST_PATH = DAM_ROOT / "archive_manifest_results_all.json"
OUTPUT_DIR = REPO_ROOT / "data" / "processed" / "dam_convex_import"
ATHENS = ZoneInfo("Europe/Athens")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SOURCE = "henex-dam"
TIMEZONE = "Europe/Athens"


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk import compact ENEX DAM Results data into Convex.")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--from", dest="from_date", help="Inclusive market date filter, YYYY-MM-DD.")
    parser.add_argument("--to", dest="to_date", help="Inclusive market date filter, YYYY-MM-DD.")
    parser.add_argument("--deployment", help="Convex deployment name, e.g. first-axolotl-94.")
    parser.add_argument("--prod", action="store_true", help="Import into this project's default production deployment.")
    parser.add_argument("--dry-run", action="store_true", help="Write import files and summary without calling Convex import.")
    parser.add_argument("--convex-command", default="npx convex")
    parser.add_argument("--limit-files", type=int)
    return parser.parse_args()


def require_date_key(value: str | None, name: str) -> str | None:
    if value is None:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise SystemExit(f"{name} must use YYYY-MM-DD format") from exc
    return value


def normalize_market_date(value: Any) -> str:
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    if len(text) >= 10:
        return text[:10]
    raise ValueError(f"Unsupported market date: {value!r}")


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Manifest not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def selected_results_assets(manifest: dict[str, Any], from_date: str | None, to_date: str | None) -> list[dict[str, Any]]:
    assets = []
    for asset in manifest.get("assets", []):
        if asset.get("source_code") != "Results":
            continue
        market_date = normalize_market_date(asset.get("market_date"))
        if from_date and market_date < from_date:
            continue
        if to_date and market_date > to_date:
            continue
        assets.append(asset)
    return sorted(assets, key=lambda item: normalize_market_date(item.get("market_date")))


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        payload = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ElementTree.fromstring(payload)
    return ["".join(text.text or "" for text in item.iter(f"{NS}t")) for item in root.findall(f"{NS}si")]


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


def compact_interval_rows(asset: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    path = REPO_ROOT / asset["output_path"]
    if not path.exists():
        raise FileNotFoundError(path)

    sheet_name, rows_iter = iter_xlsx_rows(path)
    iterator = iter(rows_iter)
    headers = [str(value).strip() if value is not None else "" for value in next(iterator)]
    grouped: dict[str, dict[str, Any]] = {}

    for values in iterator:
        if not any(value is not None for value in values):
            continue
        row = raw_row(headers, values)
        market_date = normalize_market_date(row.get("DDAY") or asset["market_date"])
        timestamp = parse_local_timestamp(row.get("DELIVERY_MTU")) or f"{market_date}T00:00:00"
        mtu = int_value(row.get("SORT"))
        bidding_zone = string_value(row.get("BIDDING_ZONE_DESCR"))
        key = "|".join([market_date, timestamp, str(mtu), bidding_zone or ""])
        interval = grouped.get(key)
        if interval is None:
            interval = {
                "marketDate": market_date,
                "timestamp": timestamp,
                "mtu": mtu or 0,
                "target": string_value(row.get("TARGET")) or "DAM",
                "sourceCode": "Results",
                "sourceFile": asset["filename"],
                "biddingZone": bidding_zone,
                "deliveryDurationMinutes": number_value(row.get("DELIVERY_DURATION")),
                "mcpEurPerMwh": number_value(row.get("MCP")),
                "buyVolumeMw": 0.0,
                "sellVolumeMw": 0.0,
                "totalVolumeMw": 0.0,
                "pubTime": parse_local_timestamp(row.get("PUB_TIME")),
                "version": number_value(row.get("VER")),
                "sheetName": sheet_name,
            }
            grouped[key] = interval

        volume = number_value(row.get("TOTAL_TRADES")) or 0.0
        if string_value(row.get("SIDE_DESCR")) == "Buy":
            interval["buyVolumeMw"] += volume
        elif string_value(row.get("SIDE_DESCR")) == "Sell":
            interval["sellVolumeMw"] += volume
        if interval.get("mcpEurPerMwh") is None:
            interval["mcpEurPerMwh"] = number_value(row.get("MCP"))

    intervals = []
    for interval in grouped.values():
        interval["buyVolumeMw"] = round(interval["buyVolumeMw"], 6)
        interval["sellVolumeMw"] = round(interval["sellVolumeMw"], 6)
        interval["totalVolumeMw"] = round(interval["buyVolumeMw"] + interval["sellVolumeMw"], 6)
        interval["rowHash"] = stable_hash(
            {
                "sourceFile": interval["sourceFile"],
                "marketDate": interval["marketDate"],
                "timestamp": interval["timestamp"],
                "mtu": interval["mtu"],
                "biddingZone": interval.get("biddingZone"),
                "version": interval.get("version"),
            }
        )
        intervals.append({key: value for key, value in interval.items() if value is not None})

    file_record = {
        "sourceCode": "Results",
        "sourceTitle": asset["source_title"],
        "marketDate": normalize_market_date(asset["market_date"]),
        "filename": asset["filename"],
        "extension": asset["extension"],
        "sourceUrl": asset["url"],
        "localPath": asset["output_path"],
        "bytes": int(asset["bytes"]),
        "sha256": asset["sha256"],
        "parsedAtUtc": utc_now_iso(),
        "rowCount": len(intervals),
        "status": "parsed",
    }
    return file_record, sorted(intervals, key=lambda row: (row["marketDate"], row["mtu"], row.get("biddingZone", "")))


def summarize_prices(price_series: list[dict[str, Any]]) -> dict[str, float] | None:
    prices = [row["mcpEurPerMwh"] for row in price_series if isinstance(row.get("mcpEurPerMwh"), (int, float))]
    if not prices:
        return None
    average = sum(prices) / len(prices)
    variance = sum((price - average) ** 2 for price in prices) / len(prices)
    return {
        "minPrice": round(min(prices), 3),
        "maxPrice": round(max(prices), 3),
        "averagePrice": round(average, 3),
        "dailySpread": round(max(prices) - min(prices), 3),
        "volatility": round(variance**0.5, 3),
    }


def coverage_for_files(files: list[dict[str, Any]]) -> dict[str, Any]:
    dates = sorted({file["marketDate"] for file in files})
    return {
        "marketDates": len(dates),
        "firstDate": dates[0] if dates else None,
        "lastDate": dates[-1] if dates else None,
        "sources": {
            "Results": {
                "files": len(files),
                "firstDate": dates[0] if dates else None,
                "lastDate": dates[-1] if dates else None,
                "rows": sum(file["rowCount"] for file in files),
            }
        },
    }


def daily_summaries(files: list[dict[str, Any]], intervals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    files_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    intervals_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for file in files:
        files_by_date[file["marketDate"]].append(file)
    for interval in intervals:
        intervals_by_date[interval["marketDate"]].append(interval)

    summaries = []
    for market_date in sorted(intervals_by_date):
        price_series = [
            {
                "marketDate": row["marketDate"],
                "timestamp": row["timestamp"],
                "mtu": row["mtu"],
                "mcpEurPerMwh": row.get("mcpEurPerMwh"),
                "buyVolume": row["buyVolumeMw"],
                "sellVolume": row["sellVolumeMw"],
                "totalTrades": row["totalVolumeMw"],
                "sourceRowCount": 1,
            }
            for row in sorted(intervals_by_date[market_date], key=lambda item: (item["timestamp"], item["mtu"]))
        ]
        summaries.append(
            {
                "marketDate": market_date,
                "generatedAtUtc": utc_now_iso(),
                "source": SOURCE,
                "timezone": TIMEZONE,
                "coverage": coverage_for_files(files_by_date.get(market_date, [])),
                "priceSeries": price_series,
                "spreadSummary": summarize_prices(price_series),
                "volumeSeries": [
                    {
                        "marketDate": point["marketDate"],
                        "timestamp": point["timestamp"],
                        "mtu": point["mtu"],
                        "buyVolume": point["buyVolume"],
                        "sellVolume": point["sellVolume"],
                        "totalTrades": point["totalTrades"],
                    }
                    for point in price_series
                ],
                "curveFragility": [],
                "fileCount": len(files_by_date.get(market_date, [])),
                "marketRowCount": len(price_series),
                "curveRowCount": 0,
            }
        )
    return summaries


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":"), ensure_ascii=False))
            handle.write("\n")


def convex_import(args: argparse.Namespace, table: str, path: Path) -> None:
    command = shlex.split(args.convex_command) + [
        "import",
        "--table",
        table,
        "--replace",
        "--yes",
        "--format",
        "jsonLines",
    ]
    if args.prod:
        command.append("--prod")
    if args.deployment:
        command.extend(["--deployment", args.deployment])
    command.append(str(path))
    result = subprocess.run(command, cwd=REPO_ROOT, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Convex import failed for {table}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    print(result.stdout.strip())


def main() -> int:
    args = parse_args()
    args.from_date = require_date_key(args.from_date, "--from")
    args.to_date = require_date_key(args.to_date, "--to")
    manifest = load_manifest(args.manifest)
    assets = selected_results_assets(manifest, args.from_date, args.to_date)
    if args.limit_files is not None:
        assets = assets[: args.limit_files]

    files: list[dict[str, Any]] = []
    intervals: list[dict[str, Any]] = []
    for asset in assets:
        file_record, rows = compact_interval_rows(asset)
        files.append(file_record)
        intervals.extend(rows)

    summaries = daily_summaries(files, intervals)
    files_path = args.output_dir / "damFiles.jsonl"
    intervals_path = args.output_dir / "damPriceIntervals.jsonl"
    summaries_path = args.output_dir / "damDailySummaries.jsonl"
    write_jsonl(files_path, files)
    write_jsonl(intervals_path, intervals)
    write_jsonl(summaries_path, summaries)

    summary = {
        "files": len(files),
        "intervals": len(intervals),
        "summaries": len(summaries),
        "fromDate": files[0]["marketDate"] if files else None,
        "toDate": files[-1]["marketDate"] if files else None,
        "outputDir": str(args.output_dir),
        "dryRun": args.dry_run,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))

    if not args.dry_run:
        convex_import(args, "damFiles", files_path)
        convex_import(args, "damPriceIntervals", intervals_path)
        convex_import(args, "damDailySummaries", summaries_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
