"""把待填 CSV 切成給 agent 認領的工作包,並把填好的 JSONL 合併回一份新 CSV。

    python3 migration/fill_shards.py split [--budget 120000]  # 產生 out/fill/shard-NN.json
    python3 migration/fill_shards.py merge                    # out/fill/*.jsonl → 新 CSV + 報告

切分依「來源文字位元組數」而非列數,否則附件多的社團會把某個 agent 撐爆。
每個 agent 只寫自己那支 shard-NN.jsonl,永遠不碰別人的檔,也不碰母 CSV。
"""

import csv
import json
import re
import sys
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parent
OUT = MIGRATION_DIR / "out"
TEXT = OUT / "text"
FILL = OUT / "fill"

# 取自 app/schemas/activities.py,與 text_fields.py 讀的是同一套上限
LIMITS = {
    "填_活動內容": 150,
    "填_成果_執行成效": 2000,
    "填_成果_目標達成": 2000,
    "填_成果_其他": 2000,
    "填_心得N_姓名": 50,
    "填_心得N_系級": 50,
    "填_心得N_內容": 5000,
}
REFLECTION_PARTS = ("姓名", "系級", "內容")


FILLED_SUFFIX = "_filled"


def latest_csv() -> Path:
    """母檔 = 最新的匯出 CSV。要排掉自己產生的 *_filled.csv ——
    字典序會把它排在母檔後面,第二次 merge 就會拿自己的輸出當輸入。"""
    cands = [p for p in OUT.glob("activity_texts_*.csv") if not p.stem.endswith(FILLED_SUFFIX)]
    if not cands:
        sys.exit(f"找不到待填 CSV:{OUT}/activity_texts_*.csv")
    return sorted(cands)[-1]


def load_rows() -> tuple[list[dict], list[str]]:
    with latest_csv().open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        return list(reader), list(reader.fieldnames or [])


def row_files(row: dict) -> list[tuple[str, str]]:
    """回傳 [(角色, 相對路徑)];角色只是給 agent 的提示,不是硬分類。"""
    out = []
    if row["企劃書"].strip():
        out.append(("企劃書", row["企劃書"].strip()))
    for p in row["結案文件"].split(";"):
        if p.strip():
            out.append(("結案文件", p.strip()))
    return out


def text_size(rel: str) -> int:
    p = TEXT / (rel + ".txt")
    return p.stat().st_size if p.exists() else 0


def in_scope(row: dict) -> bool:
    """要派工的列。

    沒有結案文件 = 活動未結案,成果與心得在 import 端本來就會被跳過(沒有
    ActivityReport 可寫),派出去也只是燒 token。這種列只剩活動內容要補,
    而它多半已由 cms_import 從舊系統的活動描述預帶,只有真的空白才收進來。
    """
    return bool(row["結案文件"].strip()) or not row["填_活動內容"].strip()


def split(budget: int) -> None:
    all_rows, _ = load_rows()
    rows = [r for r in all_rows if in_scope(r)]
    skipped = len(all_rows) - len(rows)
    print(
        f"派工 {len(rows)} 列 / 全部 {len(all_rows)} 列"
        f"(略過 {skipped} 列:未結案且活動內容已有值)"
    )
    FILL.mkdir(parents=True, exist_ok=True)
    shards: list[list[dict]] = [[]]
    used = 0
    for row in rows:
        files = row_files(row)
        size = sum(text_size(rel) for _role, rel in files) or 2000
        if used and used + size > budget:
            shards.append([])
            used = 0
        shards[-1].append({"row": row, "files": files, "size": size})
        used += size

    for i, shard in enumerate(shards, 1):
        name = f"shard-{i:02d}"
        payload = {
            "shard": name,
            "output": str((FILL / f"{name}.jsonl").resolve()),
            "text_root": str(TEXT.resolve()),
            "limits": LIMITS,
            "rows": [
                {
                    "legacy_id": e["row"]["legacy_id"],
                    "社團": e["row"]["社團"],
                    "活動名稱": e["row"]["活動名稱"],
                    "活動日期": e["row"]["活動日期"],
                    "狀態": e["row"]["狀態"],
                    "既有_活動內容": e["row"]["填_活動內容"],
                    "要填": (
                        ["活動內容", "成果三欄", "心得"]
                        if e["row"]["結案文件"].strip()
                        else ["活動內容"]
                    ),
                    "來源檔": [
                        {"role": role, "text": str((TEXT / (rel + ".txt")).resolve()), "orig": rel}
                        for role, rel in e["files"]
                    ],
                }
                for e in shard
            ],
        }
        (FILL / f"{name}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    total = sum(sum(e["size"] for e in s) for s in shards)
    print(f"{len(rows)} 列 → {len(shards)} 個 shard,來源文字共 {total / 1e6:.1f} MB")
    for i, s in enumerate(shards, 1):
        print(f"  shard-{i:02d}: {len(s):3d} 列, {sum(e['size'] for e in s) / 1000:6.0f} KB")


# ---------------------------------------------------------------------------
def _check(rec: dict) -> list[str]:
    bad = []
    for col, limit in LIMITS.items():
        if "N" in col:
            continue
        v = (rec.get(col) or "").strip()
        if len(v) > limit:
            bad.append(f"{col} {len(v)} 字 > {limit}")
    slots: dict[str, dict] = {}
    for k, v in rec.items():
        if k.startswith("填_心得") and k.count("_") == 2:
            n, part = k[len("填_心得") :].split("_", 1)
            if part in REFLECTION_PARTS:
                slots.setdefault(n, {})[part] = (v or "").strip()
    for n, parts in sorted(slots.items()):
        filled = {k: v for k, v in parts.items() if v}
        if not filled:
            continue
        if len(filled) < 3:
            bad.append(f"心得{n} 只填了 {'、'.join(sorted(filled))}")
        for part in REFLECTION_PARTS:
            limit = LIMITS[f"填_心得N_{part}"]
            if len(parts.get(part, "")) > limit:
                bad.append(f"心得{n}_{part} {len(parts[part])} 字 > {limit}")
    return bad


_COL_RE = re.compile(r"^填_心得(\d+)_(姓名|系級|內容)$")


def _col_order(col: str) -> tuple[int, int]:
    """心得欄依「篇號、姓名/系級/內容」排 —— 字典序會把心得10 排到心得4 前面,
    而這份 CSV 是要給人開 Excel 對著改的。"""
    m = _COL_RE.match(col)
    if m:
        return int(m.group(1)), REFLECTION_PARTS.index(m.group(2))
    return 10**6, 0


def merge() -> None:
    rows, header = load_rows()
    by_id = {r["legacy_id"]: r for r in rows}
    filled: dict[str, dict] = {}
    problems: list[str] = []
    extra_cols: list[str] = []

    for path in sorted(FILL.glob("*.jsonl")):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as exc:
                problems.append(f"{path.name}:{lineno} JSON 壞掉:{exc}")
                continue
            lid = str(rec.get("legacy_id", "")).strip()
            if lid not in by_id:
                problems.append(f"{path.name}:{lineno} legacy_id={lid!r} 不在母 CSV")
                continue
            if lid in filled:
                problems.append(f"{path.name}:{lineno} legacy_id={lid} 重複,後者覆蓋前者")
            bad = _check(rec)
            if bad:
                problems.append(f"{path.name}:{lineno} legacy_id={lid}:{'、'.join(bad)}")
                continue
            filled[lid] = rec
            for k in rec:
                if k.startswith("填_") and k not in header and k not in extra_cols:
                    extra_cols.append(k)

    out_header = header + sorted(extra_cols, key=_col_order)
    out_path = OUT / (latest_csv().stem + FILLED_SUFFIX + ".csv")
    with out_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=out_header)
        w.writeheader()
        for r in rows:
            merged = {**{c: "" for c in out_header}, **r}
            rec = filled.get(r["legacy_id"])
            if rec:
                for k, v in rec.items():
                    if k.startswith("填_"):
                        merged[k] = (v or "").strip()
            w.writerow(merged)

    print(f"合併 {len(filled)}/{len(rows)} 列 → {out_path}")
    if problems:
        rep = OUT / "fill_problems.txt"
        rep.write_text("\n".join(problems), encoding="utf-8")
        print(f"有 {len(problems)} 項問題(該列未併入)→ {rep}")
        for p in problems[:20]:
            print("  " + p)
    missing = [r["legacy_id"] for r in rows if r["legacy_id"] not in filled]
    if missing:
        (OUT / "fill_missing.txt").write_text("\n".join(missing), encoding="utf-8")
        print(f"還沒填的 {len(missing)} 列 → {OUT / 'fill_missing.txt'}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "split":
        has = "--budget" in sys.argv
        split(int(sys.argv[sys.argv.index("--budget") + 1]) if has else 120_000)
    elif cmd == "merge":
        merge()
    else:
        sys.exit(__doc__)
