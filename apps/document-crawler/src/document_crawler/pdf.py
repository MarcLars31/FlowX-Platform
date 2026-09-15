from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

PDF_SIGNATURE = b"%PDF-"
WINDOWS_RESERVED = {
    "con",
    "prn",
    "aux",
    "nul",
    *(f"com{number}" for number in range(1, 10)),
    *(f"lpt{number}" for number in range(1, 10)),
}


def has_pdf_signature(prefix: bytes) -> bool:
    # A small BOM/whitespace allowance accommodates imperfect but readable producers.
    return prefix.lstrip(b"\xef\xbb\xbf\x00\t\r\n ")[:5] == PDF_SIGNATURE


def is_pdf_resource(content_type: str, prefix: bytes) -> bool:
    return content_type.casefold() in {
        "application/pdf",
        "application/x-pdf",
    } or has_pdf_signature(prefix)


def safe_stem(value: str, fallback: str = "document") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").casefold()
    stem = re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-._")
    stem = (stem or fallback)[:100]
    return f"document-{stem}" if stem in WINDOWS_RESERVED else stem


def stable_filename(title: str, url: str, sha256: str) -> str:
    url_name = Path(unquote(urlsplit(url).path)).stem
    stem = safe_stem(title or url_name)
    return f"{stem}-{sha256[:12]}.pdf"


def infer_title(link_text: str, url: str) -> str:
    clean = " ".join(link_text.split()).strip(" -_|:")
    if clean and clean.casefold() not in {"download", "pdf", "view", "open"}:
        return clean[:300]
    raw = Path(unquote(urlsplit(url).path)).stem.replace("_", " ").replace("-", " ")
    return " ".join(raw.split())[:300] or "Untitled document"


def infer_document_type(text: str) -> str:
    lowered = text.casefold()
    if any(marker in lowered for marker in ("sprinkler overview", "product overview")):
        return "product_overview"
    if "technical data" in lowered and infer_product_family(text):
        return "data_sheet"
    rules = (
        (("installation", "install"), "installation_instruction"),
        (("manual", "handbook"), "manual"),
        (("submittal",), "submittal"),
        (("special bulletin", "technical bulletin", "bulletin"), "technical_bulletin"),
        (
            ("technical data sheet", "data sheet", "datasheet", "product data"),
            "data_sheet",
        ),
        (("certificate", "certification", "certificate of compliance"), "certificate"),
        (("approval", "listing", "fm approved", "ul listed"), "approval"),
        (("technical data",), "technical_reference"),
    )
    for keywords, document_type in rules:
        if any(keyword in lowered for keyword in keywords):
            return document_type
    return "document"


def infer_language(text: str) -> str:
    lowered = f" {text.casefold()} "
    if any(token in lowered for token in (" svenska ", " installationanvisning ", " godkännande ")):
        return "sv"
    if any(token in lowered for token in (" norsk ", " monteringsanvisning ", " godkjenning ")):
        return "no"
    if any(token in lowered for token in (" deutsch ", " datenblatt ", " montageanleitung ")):
        return "de"
    if any(token in lowered for token in (" français ", " fiche technique ")):
        return "fr"
    return "en"


def infer_product_family(text: str) -> str | None:
    patterns = (
        r"\bVK\s?\d{3,5}\b",
        r"\bTY\s?\d{3,5}\b",
        r"\b(?:model|style)\s+[A-Z0-9][A-Z0-9._/-]{1,20}\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return " ".join(match.group(0).upper().split())
    return None
