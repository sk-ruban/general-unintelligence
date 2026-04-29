#!/usr/bin/env python3
"""Download all Day-Ahead Market publication streams from ENEX."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path


SOURCE_PAGE = "https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market"
ARCHIVE_PAGE = "https://www.enexgroup.gr/web/guest/dam-idm-archive"
OUTPUT_ROOT = Path("data/dam")
USER_AGENT = "odyceo-hackathon-dam-puller/1.0"
ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}
SPECIAL_FOLDERS = {
    "AggrCurves": Path("aggr_curves"),
    "BLKORDRs": Path("blkordrs"),
    "POSNOMs": Path("posno_ms"),
    "PreMarketSummary": Path("pre_market_summary"),
    "PrelimResults": Path("prelim_results"),
    "ResultsSummary": Path("results_summary"),
}
KNOWN_CODES = [
    "AggrCurves",
    "BLKORDRs",
    "MWO",
    "NDPS",
    "POSNOMs",
    "PreMarketSummary",
    "PrelimResults",
    "Results",
    "ResultsSummary",
]


@dataclass(frozen=True)
class Source:
    instance_id: str
    code: str
    title: str
    extension: str
    rss_url: str
    folder: Path
    page_count: int


@dataclass(frozen=True)
class Asset:
    source_code: str
    source_title: str
    market_date: str
    filename: str
    extension: str
    url: str
    output_path: str
    bytes: int
    sha256: str
    origin: str
    archive_year: str
    archive_filename: str


@dataclass(frozen=True)
class Archive:
    year: str
    code: str
    title: str
    filename: str
    url: str
    folder: Path


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[dict[str, str]] = []
        self._current_anchor: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key: value or "" for key, value in attrs}
        if tag == "a":
            self._current_anchor = {"href": attr_map.get("href", ""), "text": ""}
        elif tag == "link" and attr_map.get("href"):
            self.links.append(
                {
                    "href": attr_map["href"],
                    "text": attr_map.get("title", ""),
                    "rel": attr_map.get("rel", ""),
                }
            )

    def handle_data(self, data: str) -> None:
        if self._current_anchor is not None:
            self._current_anchor["text"] += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._current_anchor is not None:
            self.links.append(self._current_anchor)
            self._current_anchor = None


def request_bytes(url: str, retries: int = 3) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError) as error:
            last_error = error
            if attempt == retries:
                break
            time.sleep(0.5 * attempt)

    raise RuntimeError(f"Failed to fetch {url}: {last_error}") from last_error


def request_text(url: str) -> str:
    return request_bytes(url).decode("utf-8", errors="replace")


def parse_links(html: str) -> list[dict[str, str]]:
    parser = LinkParser()
    parser.feed(html)
    return parser.links


def clean_text(value: str) -> str:
    return " ".join(urllib.parse.unquote(value).split())


def folder_name(code: str) -> Path:
    if code in SPECIAL_FOLDERS:
        return SPECIAL_FOLDERS[code]
    words = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|\d+", code)
    slug = "_".join(word.lower() for word in words)
    return Path(slug or code.lower())


def title_for_code(code: str) -> str:
    return {
        "AggrCurves": "HEnEx EL-DAM Aggregated Buy/Sell Orders Curves",
        "BLKORDRs": "HEnEx EL-DAM Block Orders Acceptance/Status",
        "MWO": "HEnEx EL-DAM Weekly Outlook",
        "NDPS": "HEnEx EL-DAM Net Delivery/Offtake Positions (FWD)",
        "POSNOMs": "HEnEx EL-DAM Net Delivery/Offtake Nominations (FWD)",
        "PreMarketSummary": "HEnEx EL-DAM Pre-Market Report",
        "PrelimResults": "HEnEx EL-DAM Market Coupling Results",
        "Results": "HEnEx EL-DAM Results",
        "ResultsSummary": "HEnEx EL-DAM Market Report",
    }.get(code, f"HEnEx EL-DAM {code}")


def normalize_sources(values: list[str] | None) -> set[str] | None:
    if not values:
        return None
    requested: set[str] = set()
    aliases = {folder_name(code).as_posix().lower(): code for code in KNOWN_CODES}
    aliases.update({code.lower(): code for code in KNOWN_CODES})
    aliases.update(
        {
            "aggrcurves": "AggrCurves",
            "aggr_curves": "AggrCurves",
            "blkordrs": "BLKORDRs",
            "mwo": "MWO",
            "ndps": "NDPS",
            "posnoms": "POSNOMs",
            "posno_ms": "POSNOMs",
            "premarketsummary": "PreMarketSummary",
            "pre_market_summary": "PreMarketSummary",
            "prelimresults": "PrelimResults",
            "prelim_results": "PrelimResults",
            "results": "Results",
            "resultssummary": "ResultsSummary",
            "results_summary": "ResultsSummary",
        }
    )
    for value in values:
        for part in value.split(","):
            key = part.strip()
            if not key:
                continue
            requested.add(aliases.get(key.lower(), key))
    return requested


def extract_feed_links(html: str) -> list[tuple[str, str]]:
    feeds: list[tuple[str, str]] = []
    seen: set[str] = set()

    for link in parse_links(html):
        href = urllib.parse.unquote(link.get("href", "").replace("&amp;", "&"))
        if "p_p_resource_id=getRSS" not in href:
            continue
        match = re.search(r"AssetPublisherPortlet_INSTANCE_([A-Za-z0-9]+)", href)
        if not match:
            continue
        instance_id = match.group(1)
        if instance_id in seen:
            continue
        seen.add(instance_id)
        feeds.append((instance_id, urllib.parse.urljoin(SOURCE_PAGE, href)))

    return feeds


def max_page_for_instance(html: str, instance_id: str) -> int:
    page_numbers = [
        int(match.group(1))
        for match in re.finditer(rf"INSTANCE_{re.escape(instance_id)}_cur=(\d+)", html)
    ]
    return max(page_numbers, default=1)


def source_from_feed(instance_id: str, rss_url: str, main_html: str) -> Source:
    root = ET.fromstring(request_text(rss_url))
    title = root.findtext("atom:title", default="", namespaces=ATOM_NS)
    first_entry_title = root.findtext("atom:entry/atom:title", default="", namespaces=ATOM_NS)
    match = re.search(r"_EL-DAM_(.+?)_EN_v\d+\.(xlsx|pdf)$", first_entry_title)
    if not match:
        raise RuntimeError(f"Cannot infer source code from RSS {rss_url}")

    code = match.group(1)
    extension = match.group(2)
    return Source(
        instance_id=instance_id,
        code=code,
        title=title,
        extension=extension,
        rss_url=rss_url,
        folder=folder_name(code),
        page_count=max_page_for_instance(main_html, instance_id),
    )


def discover_sources(main_html: str) -> list[Source]:
    return [
        source_from_feed(instance_id, rss_url, main_html)
        for instance_id, rss_url in extract_feed_links(main_html)
    ]


def page_url(source: Source, page: int) -> str:
    portlet = f"com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_{source.instance_id}"
    params = {
        "p_p_id": portlet,
        "p_p_lifecycle": "0",
        "p_p_state": "normal",
        "p_p_mode": "view",
        f"_{portlet}_delta": "7",
        "p_r_p_resetCur": "false",
        f"_{portlet}_cur": str(page),
    }
    return f"{SOURCE_PAGE}?{urllib.parse.urlencode(params)}"


def iter_source_file_links(source: Source, html: str) -> list[tuple[str, str]]:
    marker = f"_EL-DAM_{source.code}_EN_"
    suffix = f".{source.extension}"
    matches: list[tuple[str, str]] = []

    for link in parse_links(html):
        text = clean_text(link.get("text", ""))
        href = link.get("href", "").replace("&amp;", "&")
        if marker not in text or not text.endswith(suffix):
            continue
        matches.append((text, urllib.parse.urljoin(SOURCE_PAGE, href)))

    return matches


def discover_source_assets(source: Source) -> list[tuple[str, str]]:
    assets: dict[str, str] = {}
    for page in range(1, source.page_count + 1):
        html = request_text(page_url(source, page))
        for filename, url in iter_source_file_links(source, html):
            assets.setdefault(filename, url)
        time.sleep(0.05)

    return sorted(assets.items(), reverse=True)


def infer_archive_code(filename: str) -> str | None:
    stem = filename
    while stem.endswith(".zip"):
        stem = stem.removesuffix(".zip")
    if stem.endswith("_ResultsSummary"):
        return "ResultsSummary"
    if stem.endswith("_PreMarketSummary"):
        return "PreMarketSummary"
    if stem.endswith("_PrelimResults"):
        return "PrelimResults"
    if stem.endswith("_AggrCurves"):
        return "AggrCurves"
    if stem.endswith("_BLKORDRs"):
        return "BLKORDRs"
    if stem.endswith("_POSNOMs"):
        return "POSNOMs"
    if stem.endswith("_Results"):
        return "Results"
    if stem.endswith("_NDPS"):
        return "NDPS"
    if stem.endswith("_MWO"):
        return "MWO"
    return None


def discover_archives(archive_html: str, requested_sources: set[str] | None, requested_years: set[str] | None) -> list[Archive]:
    archives: dict[str, Archive] = {}
    for link in parse_links(archive_html):
        filename = clean_text(link.get("text", ""))
        href = link.get("href", "").replace("&amp;", "&")
        match = re.match(r"(\d{4})_.+\.zip(?:\.zip)?$", filename)
        if not match:
            continue
        if "EL-DAM" not in filename:
            continue
        year = match.group(1)
        code = infer_archive_code(filename)
        if code is None:
            continue
        if requested_sources is not None and code not in requested_sources:
            continue
        if requested_years is not None and year not in requested_years:
            continue
        archives[filename] = Archive(
            year=year,
            code=code,
            title=title_for_code(code),
            filename=filename,
            url=urllib.parse.urljoin(ARCHIVE_PAGE, href),
            folder=folder_name(code),
        )
    return sorted(archives.values(), key=lambda archive: (archive.code, archive.year, archive.filename))


def parse_market_date(filename: str) -> str:
    match = re.match(r"(\d{8})_", filename)
    if not match:
        return ""
    value = match.group(1)
    return f"{value[:4]}-{value[4:6]}-{value[6:]}"


def validate_payload(filename: str, data: bytes) -> None:
    if filename.endswith(".xlsx") and not data.startswith(b"PK\x03\x04"):
        raise RuntimeError(f"{filename} did not download as an XLSX file")
    if filename.endswith(".pdf") and not data.startswith(b"%PDF"):
        raise RuntimeError(f"{filename} did not download as a PDF file")
    if filename.endswith(".zip") and not data.startswith(b"PK"):
        raise RuntimeError(f"{filename} did not download as a ZIP file")


def download_asset(source: Source, filename: str, url: str) -> Asset:
    output_dir = OUTPUT_ROOT / source.folder
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename

    if output_path.exists():
        data = output_path.read_bytes()
        validate_payload(filename, data)
    else:
        data = request_bytes(url)
        validate_payload(filename, data)
        output_path.write_bytes(data)

    return Asset(
        source_code=source.code,
        source_title=source.title,
        market_date=parse_market_date(filename),
        filename=filename,
        extension=source.extension,
        url=url,
        output_path=output_path.as_posix(),
        bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        origin="current",
        archive_year="",
        archive_filename="",
    )


def archive_member_is_relevant(archive: Archive, member_name: str) -> bool:
    basename = Path(member_name).name
    if archive.code == "MWO":
        return re.match(r"\d{8}_EL-DAM_MWO_EN_v\d+\.pdf$", basename) is not None
    return re.match(rf"\d{{8}}_EL-DAM_{re.escape(archive.code)}_EN_v\d+\.xlsx$", basename) is not None


def extract_zip_members(archive: Archive, archive_file: zipfile.ZipFile) -> list[tuple[str, bytes]]:
    extracted: list[tuple[str, bytes]] = []
    for member in archive_file.infolist():
        if member.is_dir():
            continue
        filename = Path(member.filename).name
        data = archive_file.read(member)
        if filename.endswith(".zip"):
            if "EL-DAM" not in filename:
                continue
            with zipfile.ZipFile(io.BytesIO(data)) as nested_archive:
                extracted.extend(extract_zip_members(archive, nested_archive))
            continue
        if not archive_member_is_relevant(archive, filename):
            continue
        extracted.append((filename, data))
    return extracted


def extract_archive_assets(archive: Archive) -> list[Asset]:
    archive_data = request_bytes(archive.url)
    validate_payload(archive.filename, archive_data)
    assets: list[Asset] = []
    with zipfile.ZipFile(io.BytesIO(archive_data)) as archive_file:
        for filename, member_data in extract_zip_members(archive, archive_file):
            output_dir = OUTPUT_ROOT / archive.folder
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / filename
            if output_path.exists():
                data = output_path.read_bytes()
            else:
                data = member_data
                output_path.write_bytes(data)
            validate_payload(filename, data)
            assets.append(
                Asset(
                    source_code=archive.code,
                    source_title=archive.title,
                    market_date=parse_market_date(filename),
                    filename=filename,
                    extension=Path(filename).suffix.removeprefix("."),
                    url=archive.url,
                    output_path=output_path.as_posix(),
                    bytes=len(data),
                    sha256=hashlib.sha256(data).hexdigest(),
                    origin="archive",
                    archive_year=archive.year,
                    archive_filename=archive.filename,
                )
            )
    return sorted(assets, key=lambda asset: asset.filename, reverse=True)


def discover_documentation(main_html: str) -> list[tuple[str, str]]:
    docs: dict[str, str] = {}
    for link in parse_links(main_html):
        text = clean_text(link.get("text", ""))
        href = link.get("href", "").replace("&amp;", "&")
        decoded_path = urllib.parse.unquote(urllib.parse.urlparse(href).path)
        if "EL-DAM" not in text or "Documentation" not in decoded_path or not decoded_path.endswith(".pdf"):
            continue
        filename = Path(decoded_path).name
        docs[filename] = urllib.parse.urljoin(SOURCE_PAGE, href)
    return sorted(docs.items())


def download_documentation(filename: str, url: str) -> dict[str, str | int]:
    output_dir = OUTPUT_ROOT / "documentation"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    if output_path.exists():
        data = output_path.read_bytes()
        validate_payload(filename, data)
    else:
        data = request_bytes(url)
        validate_payload(filename, data)
        output_path.write_bytes(data)
    return {
        "filename": filename,
        "url": url,
        "output_path": output_path.as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def write_manifests(
    sources: list[Source],
    archives: list[Archive],
    assets: list[Asset],
    docs: list[dict[str, str | int]],
    manifest_stem: str,
) -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    manifest = {
        "source_page": SOURCE_PAGE,
        "archive_page": ARCHIVE_PAGE,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": [asdict(source) | {"folder": source.folder.as_posix()} for source in sources],
        "archives": [asdict(archive) | {"folder": archive.folder.as_posix()} for archive in archives],
        "asset_count": len(assets),
        "documentation_count": len(docs),
        "assets": [asdict(asset) for asset in assets],
        "documentation": docs,
    }

    (OUTPUT_ROOT / f"{manifest_stem}.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with (OUTPUT_ROOT / f"{manifest_stem}.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "source_code",
                "source_title",
                "market_date",
                "filename",
                "extension",
                "url",
                "output_path",
                "bytes",
                "sha256",
                "origin",
                "archive_year",
                "archive_filename",
            ],
        )
        writer.writeheader()
        writer.writerows(asdict(asset) for asset in assets)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download ENEX Day-Ahead Market publication streams.")
    parser.add_argument(
        "--sources",
        nargs="*",
        help="Optional source codes or folder names to pull, comma-separated or space-separated.",
    )
    parser.add_argument(
        "--years",
        nargs="*",
        help="Optional archive years to pull, comma-separated or space-separated. Applies only to --include-archive.",
    )
    parser.add_argument(
        "--include-archive",
        action="store_true",
        help="Also pull yearly ZIPs from the ENEX DAM/IDM archive page.",
    )
    parser.add_argument(
        "--archive-only",
        action="store_true",
        help="Pull only archive ZIPs and skip current rolling publications.",
    )
    parser.add_argument(
        "--list-archives",
        action="store_true",
        help="List matching archive ZIPs without downloading them.",
    )
    parser.add_argument(
        "--manifest-stem",
        default="manifest",
        help="Manifest filename stem under data/dam. Defaults to manifest.",
    )
    return parser.parse_args()


def normalize_years(values: list[str] | None) -> set[str] | None:
    if not values:
        return None
    years: set[str] = set()
    for value in values:
        for part in value.split(","):
            year = part.strip()
            if year:
                years.add(year)
    return years


def main() -> None:
    args = parse_args()
    requested_sources = normalize_sources(args.sources)
    requested_years = normalize_years(args.years)
    sources: list[Source] = []
    archives: list[Archive] = []
    assets: list[Asset] = []
    docs: list[dict[str, str | int]] = []

    if not args.archive_only and not args.list_archives:
        main_html = request_text(SOURCE_PAGE)
        sources = [
            source
            for source in discover_sources(main_html)
            if requested_sources is None or source.code in requested_sources
        ]

        for source in sources:
            file_links = discover_source_assets(source)
            print(f"{source.code}: {len(file_links)} current files across {source.page_count} pages", flush=True)
            for filename, url in file_links:
                assets.append(download_asset(source, filename, url))

        for filename, url in discover_documentation(main_html):
            docs.append(download_documentation(filename, url))

    if args.include_archive or args.archive_only or args.list_archives:
        archive_html = request_text(ARCHIVE_PAGE)
        archives = discover_archives(archive_html, requested_sources, requested_years)
        if args.list_archives:
            for archive in archives:
                print(f"{archive.year}\t{archive.code}\t{archive.filename}\t{archive.url}")
            return

        for archive in archives:
            archive_assets = extract_archive_assets(archive)
            print(f"{archive.code}: extracted {len(archive_assets)} DAM files from {archive.filename}", flush=True)
            assets.extend(archive_assets)

    assets = sorted({asset.output_path: asset for asset in assets}.values(), key=lambda asset: asset.output_path)
    write_manifests(sources, archives, assets, docs, args.manifest_stem)
    print(
        f"Downloaded {len(assets)} data files and {len(docs)} documentation files into {OUTPUT_ROOT}",
        flush=True,
    )


if __name__ == "__main__":
    main()
