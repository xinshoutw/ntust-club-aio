"""成果報告表/學習心得 PDF 動態生成(下載時由結案資料產生,不落檔)。

版型依 docs/模板_社團活動成果報告表.docx 與 模板_社團活動學習心得.docx
(標籤/值兩欄表格;需求方允許版型調整)。
字型內嵌 Noto Sans TC(OFL):CID 字型(MSung-Light)在多數檢視器不渲染中文,
正式文件必須嵌字。
"""

import io
from pathlib import Path

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
