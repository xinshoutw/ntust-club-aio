"""社團活動申請表 PDF 動態生成(下載時由申請資料產生,不落檔)。

版面沿用舊系統的 LaTeX 版(legacy/ClubManagementSystem/Club/GeneratePDF/activity_apply.tex):
12 欄基準格線,各列以 span 組出欄位;欄寬比例取自舊版產出的實測值,結構與欄位順序不得更動。
字型內嵌標楷體(教育部標準楷書 edukai 5.1):CID 字型在多數檢視器不渲染中文,正式文件必須嵌字。
"""

import io
from itertools import groupby
from pathlib import Path
from urllib.parse import quote

from fastapi import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.semesters import TAIPEI, semester_of
from app.models import Activity, Club

_ASSETS = Path(__file__).resolve().parents[1] / "assets"
# 標楷體(face name TW-MOE-Std-Kai)是本文字型;Noto 只在標楷體缺字時補位,見 _kai_markup
_KAI = "EduKai"
pdfmetrics.registerFont(TTFont(_KAI, str(_ASSETS / "edukai-5.1_20251208.ttf")))
_FONT = "NotoSansTC"
pdfmetrics.registerFont(TTFont(_FONT, str(_ASSETS / "NotoSansTC-Regular.ttf")))


def _escape(text: str) -> str:
    return (
        (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    ).replace("\n", "<br/>")


def pdf_response(content: bytes, filename: str) -> Response:
    """inline PDF 回應;社團端與行政端下載共用一份(檔名一律 RFC 5987 編碼)。"""
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}"},
    )


_APPLY_TITLE = ParagraphStyle("apply_title", fontName=_KAI, fontSize=17, leading=26, alignment=1)
_C = ParagraphStyle("cell", fontName=_KAI, fontSize=10.5, leading=17)
_CC = ParagraphStyle("cell_center", parent=_C, alignment=1)
_CR = ParagraphStyle("cell_right", parent=_C, alignment=2)
_FOOT = ParagraphStyle("foot", fontName=_KAI, fontSize=9, leading=13, alignment=2)

# 意見回饋固定收尾的結報提醒:承辦人填的經費來源可能是空的(沒申請經費時),這段一律都在
_APPLY_NOTE = (
    "※ 請於活動結束後兩週內完成並上傳結報。結報內容應包含："
    "1. 活動照片 5 張；2. 3 位同學的心得；3. 活動成果報告"
)

_APPLY_COLS = [
    w * 174 * mm / 720
    for w in (60, 45, 75, 52, 61.5, 61.5, 55, 55, 63.75, 63.75, 63.75, 63.75)
]

_APPLY_STYLE = [
    ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]


def _grid(rows: list[list[tuple[int, Paragraph]]]) -> tuple[list[list], list]:
    """(跨欄數, 內容) 序列展開成 12 欄資料 + SPAN 指令。"""
    data: list[list] = []
    spans: list = []
    for r, row in enumerate(rows):
        line: list = []
        col = 0
        for span, cell in row:
            line.append(cell)
            line.extend([""] * (span - 1))
            if span > 1:
                spans.append(("SPAN", (col, r), (col + span - 1, r)))
            col += span
        data.append(line)
    return data, spans


def works_text(staff_text: str) -> str:
    """工作分配一行一項,舊版申請表的寫法是「項目 > 負責人;」。

    項目/負責人以**最後一個**冒號分界(同前端 `types.staffTextToWorks`)——
    舊系統的項目本身常是「職稱:工作內容」,從第一個冒號拆會把項目切一半。
    """
    return "; ".join(
        " > ".join(line.rsplit(":", 1)) for line in staff_text.splitlines() if line.strip()
    )


# 標楷體只有 14k 字,收不到中點「・」與拉丁重音字母 —— 活動名稱裡兩者都出現得了
_KAI_COVERS = frozenset(pdfmetrics.getFont(_KAI).face.charToGlyph)


def _kai_markup(text: str) -> str:
    """標楷體排不出來的字改由 Noto 接手,避免整格變成豆腐。"""
    out = []
    # 先分段再逸出:反過來的話 <br/>、&lt; 這些標記可能被 <font> 攔腰切開
    for missing, run in groupby(text, key=lambda c: ord(c) not in _KAI_COVERS):
        chunk = _escape("".join(run))
        out.append(f'<font name="{_FONT}">{chunk}</font>' if missing else chunk)
    return "".join(out)


def _kai(text: str, style=_C) -> Paragraph:
    """申請表的儲存格:預設走標楷體本文樣式(_para 的預設是另兩份 PDF 的 Noto)。"""
    return Paragraph(_kai_markup(text), style)


def _apply_opinion(activity: Activity) -> str:
    """意見回饋 = 承辦人核准時填的經費來源 + 固定的結報提醒。

    經費來源可能是空的(沒申請經費的活動不需要認定來源),提醒則一律都在。
    """
    source = (activity.fund_source or "").strip()
    return f"{source}\n{_APPLY_NOTE}" if source else _APPLY_NOTE


def _apply_footnote(activity: Activity) -> str:
    """頁尾的上網申請時間。

    印的是**送件時間**(D-29),不是建立時間 —— 七月建的草稿八月才送出,紙上該寫八月。
    兩者都是 TIMESTAMPTZ,asyncpg 回 UTC-aware —— 直接格式化會印成 UTC,
    早上 8 點前送的單子連日期都退一天,而這張紙是要送出去的。
    """
    # 送件時間(D-29);草稿沒有送件時間,而草稿本來就還沒有這張紙要印的那件事
    stamp = activity.submitted_at or activity.created_at
    return f"（上網申請時間：{stamp.astimezone(TAIPEI):%Y/%m/%d %H:%M:%S}）"


def _approved_text(approved: int | None) -> str:
    """學校核定欄:未核定印 `—`,不是 0。

    申請表在待審階段就下載得出來(草稿也行),而核定 0 元現在是「承辦人決定不給、當場核准」
    的意思(D-16)——把還沒核定的欄位印成 0,這張紙就說了一件沒發生的事。
    """
    return "—" if approved is None else str(approved)


def _approved_total_text(items) -> str:
    """學校核定合計:只要還有一項沒核定,合計就是未知。"""
    if any(i.approved_subsidy is None for i in items):
        return "—"
    return str(sum(i.approved_subsidy for i in items))


def _moment(day, clock) -> str:
    """申請表的時間欄:缺日期就整格留白(半個時間比空白更難讀)。"""
    if day is None:
        return ""
    return f"{day} {clock:%H:%M}" if clock is not None else f"{day}"


def apply_pdf(club: Club, activity: Activity, approvers: list[str]) -> bytes:
    """社團活動申請表;approvers 依**關卡**順序對應 初核/複核/決行(見 approver_names)。"""
    year, sem = semester_of(activity.date).split("-") if activity.date else ("", "")
    report = activity.report
    # 舊版:預計人數為 0 才退回實際人數;校外人數舊版一律 0
    people = activity.participants_in + activity.participants_out
    if people == 0 and report is not None:
        people = report.member_count + report.non_member_count
    start = _moment(activity.date, report.actual_start if report else activity.start_time)
    end = _moment(
        activity.end_date or activity.date, report.actual_end if report else activity.end_time
    )
    works = works_text(activity.staff_text)
    items = activity.budget_items
    audit = (approvers + ["", "", ""])[:3]

    rows: list[list[tuple[int, Paragraph]]] = [
        [
            (2, _kai("社團名稱", _CC)),
            (4, _kai(f"{club.attribute} — {club.name}" if club.attribute else club.name, _CC)),
            (2, _kai("參加人數", _CC)),
            # 值都是整數,直接寫 Paragraph 才留得住 nbsp(_para 會把 & 逸出)
            (4, Paragraph(f"校內：{people} 人&nbsp;&nbsp;&nbsp;&nbsp;校外：0 人", _CC)),
        ],
        [
            (2, _kai("活動名稱", _CC)),
            (4, _kai(activity.name)),
            (2, _kai("地點", _CC)),
            (4, _kai(activity.location)),
        ],
        [(2, _kai("時間", _CC)), (10, _kai(f"{start} 至 {end}", _CC))],
        [(2, _kai("活動內容", _CC)), (10, _kai(activity.content))],
        [(2, _kai("工作分配", _CC)), (10, _kai(works))],
    ]
    if items:
        rows.append(
            [
                (1, _kai("項次", _CC)),
                (2, _kai("摘要", _CC)),
                (1, _kai("自籌", _CC)),
                (2, _kai("擬請學校補助", _CC)),
                (2, _kai("學校核定", _CC)),
                (4, _kai("使用經費說明", _CC)),
            ]
        )
        rows.extend(
            [
                (1, _kai(str(i), _CC)),
                (2, _kai(b.category, _CC)),
                (1, _kai(str(b.self_fund), _CR)),
                (2, _kai(str(b.requested_subsidy), _CR)),
                (2, _kai(_approved_text(b.approved_subsidy), _CR)),
                (4, _kai(b.description)),
            ]
            for i, b in enumerate(items, 1)
        )
    rows += [
        [
            (4, _kai("支出總預算", _CC)),
            (4, _kai("社團自籌", _CC)),
            (4, _kai("學校核定", _CC)),
        ],
        [
            (4, _kai(str(sum(b.self_fund + b.requested_subsidy for b in items)), _CC)),
            (4, _kai(str(sum(b.self_fund for b in items)), _CC)),
            (4, _kai(_approved_total_text(items), _CC)),
        ],
        [(2, _kai("意見回饋", _CC)), (10, _kai(_apply_opinion(activity)))],
        [
            (1, _kai("初\n核", _CC)),
            (3, _kai(audit[0], _CC)),
            (1, _kai("複\n核", _CC)),
            (3, _kai(audit[1], _CC)),
            (1, _kai("決\n行", _CC)),
            (3, _kai(audit[2], _CC)),
        ],
    ]

    data, spans = _grid(rows)
    sign = len(data) - 1
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"{club.name}_{activity.name}_社團活動申請表",
    )
    doc.build(
        [
            Paragraph(
                f"國立臺灣科技大學<br/>{year} 學年度第 {sem} 學期社團活動申請表", _APPLY_TITLE
            ),
            Spacer(1, 3 * mm),
            Table(
                data,
                colWidths=_APPLY_COLS,
                style=TableStyle(
                    [
                        *_APPLY_STYLE,
                        *spans,
                        # 簽核列留章的高度(舊版以三個空白子列撐開)
                        ("TOPPADDING", (0, sign), (-1, sign), 16),
                        ("BOTTOMPADDING", (0, sign), (-1, sign), 16),
                    ]
                ),
                splitByRow=1,
                splitInRow=1,
            ),
            Spacer(1, 2 * mm),
            _kai(_apply_footnote(activity), _FOOT),
        ]
    )
    return buf.getvalue()
