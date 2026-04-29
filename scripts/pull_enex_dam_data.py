#!/usr/bin/env python3
"""Download all Day-Ahead Market publication streams from ENEX."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from pathlib import Path


SOURCE_PAGE = "https://www.enexgroup.gr/web/guest/markets-publications-el-day-ahead-market"
OUTPUT_ROOT = Path("data/dam")
USER_AGENT = "odyceo-hackathon-dam-puller/1.0"
ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}


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
    words = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|\d+", code)
    slug = "_".join(word.lower() for word in words)
    return Path(slug or code.lower())


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


def download_asset(source: Source, filename: str, url: str) -> Asset:
    output_dir = OUTPUT_ROOT / source.folder
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename

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
    )


def discover_documentation(main_html: str) -> list[tuple[str, str]]:
    docs: dict[str, str] = {}
    for link in parse_links(main_html):
        text = clean_text(link.get("text", ""))
        href = urllib.parse.unquote(link.get("href", "").replace("&amp;", "&"))
        if "EL-DAM" not in text or "Documentation" not in href or not href.endswith(".pdf"):
            continue
        filename = Path(urllib.parse.urlparse(href).path).name
        docs[filename] = urllib.parse.urljoin(SOURCE_PAGE, href)
    return sorted(docs.items())


def download_documentation(filename: str, url: str) -> dict[str, str | int]:
    output_dir = OUTPUT_ROOT / "documentation"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
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


def write_manifests(sources: list[Source], assets: list[Asset], docs: list[dict[str, str | int]]) -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    manifest = {
        "source_page": SOURCE_PAGE,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sources": [asdict(source) | {"folder": source.folder.as_posix()} for source in sources],
        "asset_count": len(assets),
        "documentation_count": len(docs),
        "assets": [asdict(asset) for asset in assets],
        "documentation": docs,
    }

    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    with (OUTPUT_ROOT / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
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
            ],
        )
        writer.writeheader()
        writer.writerows(asdict(asset) for asset in assets)


def main() -> None:
    main_html = request_text(SOURCE_PAGE)
    sources = discover_sources(main_html)
    assets: list[Asset] = []

    for source in sources:
        file_links = discover_source_assets(source)
        print(f"{source.code}: {len(file_links)} files across {source.page_count} pages")
        for filename, url in file_links:
            assets.append(download_asset(source, filename, url))

    docs = []
    for filename, url in discover_documentation(main_html):
        docs.append(download_documentation(filename, url))

    write_manifests(sources, assets, docs)
    print(f"Downloaded {len(assets)} data files and {len(docs)} documentation files into {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
