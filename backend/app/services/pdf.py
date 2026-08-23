"""成果報告表/學習心得 PDF 動態生成(下載時由結案資料產生,不落檔)。

版型依 docs/模板_社團活動成果報告表.docx 與 模板_社團活動學習心得.docx
(標籤/值兩欄表格;需求方允許版型調整)。
字型內嵌 Noto Sans TC(OFL):CID 字型(MSung-Light)在多數檢視器不渲染中文,
正式文件必須嵌字。
"""

import io
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

from app.core.semesters import semester_of
from app.models import Activity, ActivityReflection, ActivityReport, Club

_FONT = "NotoSansTC"
_FONT_PATH = Path(__file__).resolve().parents[1] / "assets" / "NotoSansTC-Regular.ttf"
pdfmetrics.registerFont(TTFont(_FONT, str(_FONT_PATH)))

_TITLE = ParagraphStyle(
    "title", fontName=_FONT, fontSize=16, leading=22, alignment=1, spaceAfter=6 * mm
)
_LABEL = ParagraphStyle("label", fontName=_FONT, fontSize=11, leading=16)
_BODY = ParagraphStyle("body", fontName=_FONT, fontSize=11, leading=17)

_NOTE = (
    "社團活動應於活動結束後2週內辦理結案核銷作業,將本表、活動照片5張及學習心得"
    "(或心得影片)上傳至社團管理系統,並將核銷單據或「教學車馬費領款收據」送學務處進行核銷。"
)

_TABLE_STYLE = TableStyle(
    [
        ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.93, 0.93, 0.93)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]
)


def _semester_title(activity: Activity) -> tuple[str, str]:
    year, sem = semester_of(activity.date).split("-")
    return year, sem


def _escape(text: str) -> str:
    return (
        (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    ).replace("\n", "<br/>")


def _para(text: str, style=_BODY) -> Paragraph:
    return Paragraph(_escape(text), style)


def _build(title: str, rows: list[tuple[str, Paragraph]], extra: list | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=title,
    )
    table = Table(
        [[_para(label, _LABEL), content] for label, content in rows],
        colWidths=[32 * mm, 142 * mm],
        style=_TABLE_STYLE,
        # 成果報告表的「課程執行狀況」上限約 6000 字會超過單頁,必須允許列內跨頁。
        # 只放得下有界的內容 —— 筆數會成長的內容(心得)一律走 extra,見 reflections_pdf
        splitByRow=1,
        splitInRow=1,
    )
    doc.build([Paragraph(title, _TITLE), Spacer(1, 2 * mm), table, *(extra or [])])
    return buf.getvalue()


def report_pdf(club: Club, activity: Activity, report: ActivityReport) -> bytes:
    """社團活動成果報告表。"""
    year, sem = _semester_title(activity)
    end_date = activity.end_date or activity.date
    date_text = f"{activity.date}" if end_date == activity.date else f"{activity.date}–{end_date}"
    attendance = (
        f"實際參與:社員 {report.member_count} 人、非社員 {report.non_member_count} 人\n"
        f"實際時間:{date_text} {report.actual_start:%H:%M}–{report.actual_end:%H:%M}\n"
        f"實際地點:{report.actual_location}"
    )
    others = report.others
    if report.review_meeting:
        others += f"\n檢討會議:{report.review_date}"
        if report.review_attendees is not None:
            others += f"(與會 {report.review_attendees} 人)"
        if report.review_topics:
            others += f"\n討論事項:{report.review_topics}"
        if report.review_conclusion:
            others += f"\n內容決議:{report.review_conclusion}"
    if report.video_url:
        others += f"\n成果影片:{report.video_url}"
    others += f"\n實際支出:{report.expense} 元"

    execution = (
        f"出席狀況說明:\n{attendance}\n\n"
        f"課程重點:\n{report.highlights}\n\n"
        f"說明如何達成課程目標:\n{report.goals}\n\n"
        f"其他執行狀況與成果:\n{others}"
    )
    rows = [
        ("社團名稱", _para(club.name)),
        ("課程/活動名稱", _para(activity.name)),
        ("社課講師", _para(activity.staff_text)),
        ("課程執行狀況", _para(execution)),
        ("備註", _para(_NOTE)),
    ]
    return _build(f"國立台灣科技大學{year}學年第{sem}學期 社團活動成果報告表", rows)


def reflections_pdf(
    club: Club, activity: Activity, reflections: list[ActivityReflection]
) -> bytes:
    """社團活動學習心得。"""
    year, sem = _semester_title(activity)
    rows = [
        ("社團名稱", _para(club.name)),
        ("課程/活動名稱", _para(activity.name)),
    ]
    # 心得排在表格之外、一篇一個 Paragraph:塞進表格單元格會讓 reportlab 的
    # splitInRow 每次分頁都重算整張表,合法上限(100 篇 × 5000 字)是 O(n²)——
    # 實測 n=40 要 49 秒、n=100 要 5 分鐘。交給正常 frame 流排則是線性。
    extra: list = [Spacer(1, 5 * mm), Paragraph("心得分享", _LABEL)]
    for r in reflections:
        extra.append(Spacer(1, 3 * mm))
        extra.append(_para(f"參與同學姓名/系級:{r.student_name} / {r.dept}\n{r.body}"))
    return _build(f"國立台灣科技大學{year}學年第{sem}學期 社團活動學習心得", rows, extra)


def pdf_response(content: bytes, filename: str) -> Response:
    """inline PDF 回應;社團端與行政端下載共用一份(檔名一律 RFC 5987 編碼)。"""
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}"},
    )


# ---- 社團活動申請表 ----
# 版面沿用舊系統的 LaTeX 版(Club/GeneratePDF/activity_apply.tex):12 欄基準格線,
# 各列以 span 組出欄位。欄寬比例取自舊版產出的實測值,結構與欄位順序不得更動

_APPLY_TITLE = ParagraphStyle("apply_title", fontName=_FONT, fontSize=17, leading=26, alignment=1)
_C = ParagraphStyle("cell", fontName=_FONT, fontSize=10.5, leading=17)
_CC = ParagraphStyle("cell_center", parent=_C, alignment=1)
_CR = ParagraphStyle("cell_right", parent=_C, alignment=2)
_FOOT = ParagraphStyle("foot", fontName=_FONT, fontSize=9, leading=13, alignment=2)

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


def _moment(day, clock) -> str:
    """申請表的時間欄:缺日期就整格留白(半個時間比空白更難讀)。"""
    if day is None:
        return ""
    return f"{day} {clock:%H:%M}" if clock is not None else f"{day}"


def apply_pdf(club: Club, activity: Activity, approvers: list[str]) -> bytes:
    """社團活動申請表;approvers 依簽核順序對應 初核/複核/決行。"""
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
            (2, _para("社團名稱：", _CC)),
            (4, _para(f"{club.attribute}—{club.name}" if club.attribute else club.name, _CC)),
            (2, _para("參加人數：", _CC)),
            # 值都是整數,直接寫 Paragraph 才留得住 nbsp(_para 會把 & 逸出)
            (4, Paragraph(f"校內：{people} 人&nbsp;&nbsp;&nbsp;&nbsp;校外：0 人", _CC)),
        ],
        [
            (2, _para("活動名稱：", _CC)),
            (4, _para(activity.name)),
            (2, _para("地點：", _CC)),
            (4, _para(activity.location)),
        ],
        [(2, _para("時間：", _CC)), (10, _para(f"{start} 至 {end}", _CC))],
        [(2, _para("活動內容：", _CC)), (10, _para(activity.content))],
        [(2, _para("工作分配：", _CC)), (10, _para(works))],
    ]
    if items:
        rows.append(
            [
                (1, _para("項次", _CC)),
                (2, _para("摘要", _CC)),
                (1, _para("自籌", _CC)),
                (2, _para("擬請學校補助", _CC)),
                (2, _para("學校核定", _CC)),
                (4, _para("使用經費說明", _CC)),
            ]
        )
        rows.extend(
            [
                (1, _para(str(i), _CC)),
                (2, _para(b.category, _CC)),
                (1, _para(str(b.self_fund), _CR)),
                (2, _para(str(b.requested_subsidy), _CR)),
                (2, _para(str(b.approved_subsidy or 0), _CR)),
                (4, _para(b.description)),
            ]
            for i, b in enumerate(items, 1)
        )
    rows += [
        [
            (4, _para("支出總預算", _CC)),
            (4, _para("社團自籌", _CC)),
            (4, _para("學校核定", _CC)),
        ],
        [
            (4, _para(str(sum(b.self_fund + b.requested_subsidy for b in items)), _CC)),
            (4, _para(str(sum(b.self_fund for b in items)), _CC)),
            (4, _para(str(sum(b.approved_subsidy or 0 for b in items)), _CC)),
        ],
        [(2, _para("意見回饋：", _CC)), (10, _para(activity.fund_source or ""))],
        [
            (1, _para("初\n核", _CC)),
            (3, _para(audit[0], _CC)),
            (1, _para("複\n核", _CC)),
            (3, _para(audit[1], _CC)),
            (1, _para("決\n行", _CC)),
            (3, _para(audit[2], _CC)),
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
            _para(f"(上網申請時間:{activity.created_at:%Y/%m/%d %H:%M:%S})", _FOOT),
        ]
    )
    return buf.getvalue()
