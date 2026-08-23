"""把舊系統附件(PDF / Word / ODT / PPT)批次抽成純文字,給人工轉錄與 agent 讀。

    uv run python migration/doc_text.py --all      # 抽出 CSV 引用到的所有檔案
    uv run python migration/doc_text.py <相對路徑> # 單檔,印到 stdout

非 PDF 先用 LibreOffice 轉 PDF(批次一次啟動),再一律走 pdftotext -layout。
圖片沒有文字層,只記一行 [IMAGE] 讓轉錄者知道要自己開圖看。

輸出鏡射到 out/text/<原路徑>.txt;已存在就跳過,可重跑。
"""

import concurrent.futures as cf
import csv
import subprocess
import sys
import threading
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parent
MEDIA = (MIGRATION_DIR / "../../../legacy/club_media").resolve()
OUT = MIGRATION_DIR / "out/text"
SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice"

OFFICE_EXT = {".doc", ".docx", ".odt", ".pptx", ".dotx", ".xlsx", ".rtf"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif", ".tif", ".tiff"}


def _pdftotext(pdf: Path) -> str:
    r = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"],
        capture_output=True,
        text=True,
    )
    return r.stdout


def _to_pdf(src: Path, workdir: Path) -> Path | None:
    """LibreOffice 轉 PDF。回傳轉出來的 PDF,失敗回 None。"""
    workdir.mkdir(parents=True, exist_ok=True)
    # 每個 worker 各自的 user profile,否則並行的 soffice 會互相搶 profile lock 而失敗
    profile = OUT / ".profile" / str(threading.get_ident())
    subprocess.run(
        [
            SOFFICE,
            f"-env:UserInstallation=file://{profile}",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(workdir),
            str(src),
        ],
        capture_output=True,
        timeout=300,
    )
    out = workdir / (src.stem + ".pdf")
    return out if out.exists() else None


def extract(rel: str) -> str:
    src = MEDIA / rel
    if not src.is_file():
        return f"[MISSING] {rel}"
    ext = src.suffix.lower()
    if ext in IMAGE_EXT:
        return f"[IMAGE] {rel} — 沒有文字層,請直接開圖判讀"
    if ext == ".txt":
        return src.read_text(encoding="utf-8", errors="replace")
    if ext == ".pdf":
        text = _pdftotext(src)
    elif ext in OFFICE_EXT or ext.startswith(".doc") or ext.startswith(".xls"):
        # ponytail: 每檔各起一次 soffice。2,676 檔一次性成本,不值得寫 profile 池化
        work = OUT / ".conv" / rel
        pdf = _to_pdf(src, work)
        text = _pdftotext(pdf) if pdf else ""
        if not pdf:
            return f"[CONVERT-FAILED] {rel}"
    else:
        return f"[UNSUPPORTED] {rel}"
    if len(text.strip()) < 20:
        # 掃描件沒有文字層,pdftotext 只會吐空白
        return f"[NO-TEXT-LAYER] {rel} — 疑似掃描件/純圖 PDF,請直接開檔判讀\n{text}"
    return text


def cache_path(rel: str) -> Path:
    return OUT / (rel + ".txt")


def _one(rel: str) -> tuple[str, bool]:
    dest = cache_path(rel)
    if dest.exists():
        return rel, False
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        dest.write_text(extract(rel), encoding="utf-8")
    except Exception as exc:  # 單檔壞掉不該讓整批停下來
        dest.write_text(f"[ERROR] {rel}: {exc!r}", encoding="utf-8")
    return rel, True


def referenced(csv_path: Path) -> list[str]:
    seen: dict[str, None] = {}
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            for col in ("企劃書", "結案文件"):
                for p in (row.get(col) or "").split(";"):
                    if p.strip():
                        seen.setdefault(p.strip())
    return list(seen)


def main() -> None:
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--all":
        default = sorted(OUT.parent.glob("activity_texts_*.csv"))[-1]
        csv_path = Path(args[1]) if len(args) > 1 else default
        rels = referenced(csv_path)
        done = 0
        with cf.ThreadPoolExecutor(max_workers=8) as pool:
            for i, (_rel, did) in enumerate(pool.map(_one, rels), 1):
                done += did
                if i % 100 == 0:
                    print(f"  {i}/{len(rels)}", flush=True)
        print(f"完成 {len(rels)} 檔(新抽 {done},其餘已快取)→ {OUT}")
        return
    print(extract(args[0]))


if __name__ == "__main__":
    main()
