"""
Columns-vs-DDL guard (rebuild plan §4-9).

Every table and column the backend touches through the Supabase client must
exist in the schema-as-code baseline. The July 2026 rebuild surfaced a route
that selected `study_sessions.created_at`, a column no migration had ever
created; this test makes that class of drift fail in CI instead of in
production.

How it works: the baseline migration is parsed for `create table public.<t>
(...)` blocks (column name = first token of each non-constraint line), then
every `.table("<t>")` call chain in backend/routes, backend/lib and
backend/server.py is scanned for the columns it names — select strings
(including `*_COLUMNS` constants), filter/order arguments, `on_conflict`
targets and the keys of insert/update/upsert dict literals. It is a static,
heuristic scan: it cannot see columns built dynamically at runtime, so it
complements (not replaces) backend/scripts/audit_supabase_schema.py, which
checks the live database.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Set, Tuple

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
BASELINE = ROOT_DIR / "supabase" / "migrations" / "20261006000000_baseline.sql"

SCANNED_FILES = sorted(
    list((BACKEND_DIR / "routes").glob("*.py"))
    + list((BACKEND_DIR / "lib").glob("*.py"))
    + [BACKEND_DIR / "server.py"]
)

_CONSTRAINT_PREFIXES = ("unique", "constraint", "primary key", "check", "foreign key")
_FILTER_METHODS = (
    "eq|neq|gt|gte|lt|lte|like|ilike|is_|in_|contains|contained_by|order|"
    "not_\\.eq|not_\\.is_|not_\\.in_"
)


def parse_baseline_tables(sql: str) -> Dict[str, Set[str]]:
    tables: Dict[str, Set[str]] = {}
    for match in re.finditer(
        r"create table public\.(\w+)\s*\((.*?)\n\);", sql, re.S | re.I
    ):
        name, body = match.group(1), match.group(2)
        columns: Set[str] = set()
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith("--"):
                continue
            if line.lower().startswith(_CONSTRAINT_PREFIXES):
                continue
            column = re.match(r"(\w+)\s", line)
            if column:
                columns.add(column.group(1))
        tables[name] = columns
    return tables


def _column_constants(source: str) -> Dict[str, str]:
    """`FOO_COLUMNS = ("a,b" "c")` / `FOO_COLUMNS = ["a", "b"]` -> {"FOO_COLUMNS": "a,b,c"}."""
    constants: Dict[str, str] = {}
    for match in re.finditer(
        r"^(\w+_COLUMNS)\s*=\s*\(?\s*((?:\"[^\"]*\"\s*\+?\s*)+)", source, re.M
    ):
        constants[match.group(1)] = ",".join(re.findall(r"\"([^\"]*)\"", match.group(2)))
    for match in re.finditer(r"^(\w+_COLUMNS)\s*=\s*\[(.*?)\]", source, re.M | re.S):
        constants[match.group(1)] = ",".join(re.findall(r"\"([^\"]*)\"", match.group(2)))
    return constants


def _columns_from_select(arg: str, constants: Dict[str, str]) -> Set[str]:
    # First positional argument only: `select("id,name", count="exact")` must
    # not treat "exact" as a column.
    first = arg.split(",", 1)[0] if not arg.lstrip().startswith('"') else None
    quoted = re.findall(r"\"([^\"]*)\"", arg)
    text = ""
    if arg.lstrip().startswith('"'):
        # Adjacent string literals ("a,b" "c,d") are one argument.
        head = re.match(r"\s*((?:\"[^\"]*\"\s*)+)", arg)
        text = ",".join(re.findall(r"\"([^\"]*)\"", head.group(1))) if head else (quoted[0] if quoted else "")
    elif first:
        for constant in re.findall(r"\b(\w+_COLUMNS)\b", first):
            text += constants.get(constant, "") + ","
    text = re.sub(r"\([^)]*\)", "", text)  # drop embedded resource(...) selections
    columns: Set[str] = set()
    for piece in re.split(r"[,\s]+", text):
        piece = piece.strip()
        if not piece or piece == "*" or ":" in piece or "(" in piece:
            continue
        columns.add(piece.split(".")[0])
    return columns


def scan_references(
    files: List[Path], known_tables: Set[str]
) -> Tuple[Dict[str, Set[Tuple[str, str]]], Set[Tuple[str, str]]]:
    refs: Dict[str, Set[Tuple[str, str]]] = {}
    unknown_tables: Set[Tuple[str, str]] = set()
    for path in files:
        source = path.read_text(encoding="utf-8", errors="replace")
        constants = _column_constants(source)
        for match in re.finditer(r"\.table\(\s*\"(\w+)\"\s*\)", source):
            table = match.group(1)
            location = f"{path.name}:{source[: match.start()].count(chr(10)) + 1}"
            if table not in known_tables:
                unknown_tables.add((table, location))
                continue
            chunk = source[match.end() : match.end() + 2000]
            end = chunk.find(".execute()")
            if end == -1:
                end = chunk.find("\n\n")
            chunk = chunk[: end if end != -1 else 800]

            columns: Set[str] = set()
            for select in re.finditer(r"\.select\(\s*([^)]*)\)", chunk):
                columns |= _columns_from_select(select.group(1), constants)
            for flt in re.finditer(rf"\.({_FILTER_METHODS})\(\s*\"(\w+)\"", chunk):
                columns.add(flt.group(2))
            for conflict in re.finditer(r"on_conflict\s*=\s*\"([^\"]+)\"", chunk):
                columns |= {c.strip() for c in conflict.group(1).split(",")}
            for write in re.finditer(
                r"\.(insert|update|upsert)\(\s*(\{.*?\})\s*[,)]", chunk, re.S
            ):
                columns |= set(re.findall(r"\"(\w+)\"\s*:", write.group(2)))
            refs.setdefault(table, set()).update((c, location) for c in columns)
    return refs, unknown_tables


@pytest.fixture(scope="module")
def baseline_tables() -> Dict[str, Set[str]]:
    assert BASELINE.exists(), f"baseline migration missing: {BASELINE}"
    tables = parse_baseline_tables(BASELINE.read_text(encoding="utf-8"))
    assert len(tables) == 30, f"expected 30 tables in the baseline, parsed {len(tables)}"
    return tables


def test_baseline_parser_sees_known_shape(baseline_tables):
    assert {"id", "clerk_id", "role", "stripe_customer_id"} <= baseline_tables["users"]
    assert "created_at" not in baseline_tables["study_sessions"]
    assert "started_at" in baseline_tables["study_sessions"]
    assert "reference_id" in baseline_tables["reminders"]


def test_every_referenced_table_exists(baseline_tables):
    _, unknown = scan_references(SCANNED_FILES, set(baseline_tables))
    assert not unknown, f"tables referenced in code but absent from the baseline: {sorted(unknown)}"


def test_every_referenced_column_exists(baseline_tables):
    refs, _ = scan_references(SCANNED_FILES, set(baseline_tables))
    assert refs, "scanner found no .table() calls — regex drift?"
    missing = sorted(
        (table, column, location)
        for table, items in refs.items()
        for column, location in items
        if column not in baseline_tables[table]
    )
    assert not missing, (
        "columns referenced in code but absent from "
        f"supabase/migrations/20261006000000_baseline.sql: {missing}"
    )


def test_focus_sessions_order_by_started_at():
    # The concrete regression behind this file (plan §4-9).
    source = (BACKEND_DIR / "routes" / "focus.py").read_text(encoding="utf-8")
    assert '.order("created_at"' not in source
    assert "created_at" not in re.search(r"SESSION_COLUMNS = \((.*?)\)", source, re.S).group(1)
