from __future__ import annotations

import json
import re
from typing import Any


def strip_html_to_text(html_string: str | None) -> str:
    if not html_string or not isinstance(html_string, str):
        return ""
    text = html_string
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<head[^>]*>[\s\S]*?</head>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<noscript[^>]*>[\s\S]*?</noscript>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<svg[^>]*>[\s\S]*?</svg>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<!--[\s\S]*?-->", "", text)
    text = re.sub(
        r"<\s*/\s*(p|div|li|tr|h[1-6]|section|article|header|footer|nav|main|ul|ol)[^>]*>",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"<\s*br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = re.sub(r"&#8217;|&#39;", "'", text)
    text = re.sub(r"&#8211;|&#45;", "-", text)
    text = text.replace("&#038;", "&")
    text = text.replace("&raquo;", "»")
    text = re.sub(r"[\s\n\r\t]+", " ", text)
    return text.strip()


def parse_json_from_code_block(raw: str | None) -> dict[str, Any] | None:
    if not raw or not isinstance(raw, str):
        return None
    text = raw.strip()
    m = re.match(r"^`{2,3}(?:json)?\s*\n?([\s\S]*?)\n?`{2,3}\s*$", text)
    if m:
        text = m.group(1).strip()
    try:
        out = json.loads(text)
    except json.JSONDecodeError:
        return None
    return out if isinstance(out, dict) else None
