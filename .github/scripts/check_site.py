#!/usr/bin/env python3
"""Minimal site checks: HTML well-formedness, internal links, no data-like files.

Usage: check_site.py <site_dir>
Exits 1 on any error. Standard library only.
"""
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
# Elements whose end tag may be omitted in HTML5.
OPTIONAL_END = {"p", "li", "dt", "dd", "option", "optgroup", "tr", "td", "th",
                "thead", "tbody", "tfoot", "colgroup", "rt", "rp", "html",
                "head", "body"}

# Files that must never be published (look like data, secrets or dumps).
BLOCKED_EXT = {".csv", ".tsv", ".xlsx", ".xls", ".ods", ".sqlite", ".sqlite3",
               ".db", ".env", ".pem", ".key", ".p12", ".pfx", ".jsonl",
               ".log", ".bak", ".sql", ".vcf", ".zip"}
ALLOWED_JSON = {"manifest.webmanifest", "adm/versao.json", "treinos/versao.json"}
SECRET_PATTERNS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "GitHub token"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "API key (sk-)"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AWS key"),
    (re.compile(r"(?<![\d.])\+?55\s?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}(?!\d)"),
     "Brazilian phone number"),
]
# Public numbers allowed on the site: the duo's institutional WhatsApp and a demo placeholder.
ALLOWED_NUMBERS = {"556132044860", "5561900000000"}
TEXT_EXT = {".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".md",
            ".txt", ".mjs"}
SKIP_DIRS = {".git", ".github", "node_modules"}


class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.links = []
        self.doctype = False

    def handle_decl(self, decl):
        if decl.lower().startswith("doctype"):
            self.doctype = True

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value:
                self.links.append(value)
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value:
                self.links.append(value)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                skipped = [t for t, _ in self.stack[i + 1:] if t not in OPTIONAL_END]
                if skipped:
                    self.errors.append(f"line {self.getpos()[0]}: </{tag}> closes unclosed {skipped}")
                del self.stack[i:]
                return
        self.errors.append(f"line {self.getpos()[0]}: stray </{tag}>")


def resolve(root, page_rel, link):
    parsed = urlparse(link)
    if parsed.scheme or link.startswith(("//", "#", "data:", "mailto:", "tel:", "javascript:")):
        return None
    path = unquote(parsed.path)
    if not path:
        return None
    if path.startswith("/"):
        target = os.path.join(root, path.lstrip("/"))
    else:
        target = os.path.join(root, os.path.dirname(page_rel), path)
    target = os.path.normpath(target)
    if path.endswith("/") or os.path.isdir(target):
        target = os.path.join(target, "index.html")
    return target


def main():
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    errors = []
    pages = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            ext = os.path.splitext(fn)[1].lower()
            if fn.startswith(".env") or ext in BLOCKED_EXT:
                errors.append(f"{rel}: data-like file must not be published")
                continue
            if ext == ".json" and rel not in ALLOWED_JSON:
                errors.append(f"{rel}: JSON file not in allowlist (data?)")
            if ext in TEXT_EXT and os.path.getsize(full) < 5_000_000 and "/vendor/" not in f"/{rel}":
                text = open(full, encoding="utf-8", errors="replace").read()
                for rx, label in SECRET_PATTERNS:
                    hits = [m.group(0) for m in rx.finditer(text)]
                    hits = [h for h in hits if re.sub(r"\D", "", h) not in ALLOWED_NUMBERS]
                    if hits:
                        errors.append(f"{rel}: looks like it contains a {label}")
            if ext == ".html":
                pages += 1
                text = open(full, encoding="utf-8", errors="replace").read()
                c = Checker()
                c.feed(text)
                c.close()
                if not c.doctype:
                    errors.append(f"{rel}: missing <!doctype html>")
                errors += [f"{rel}: {e}" for e in c.errors]
                left = [t for t, _ in c.stack if t not in OPTIONAL_END]
                if left:
                    errors.append(f"{rel}: unclosed tags at end: {left}")
                for link in c.links:
                    target = resolve(root, rel, link)
                    if target and not os.path.exists(target):
                        errors.append(f"{rel}: broken internal link {link}")
    if pages == 0:
        errors.append("no HTML pages found")
    for e in errors:
        print(f"::error::{e}")
    print(f"checked {pages} HTML pages, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
