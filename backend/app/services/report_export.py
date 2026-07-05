import io
from typing import List, Optional, Sequence, Tuple

from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Shared with the web UI's design tokens (frontend/src/index.css) so exported
# reports read as the same product, not a generic spreadsheet dump.
ACCENT = colors.HexColor("#2B6CB0")
INK_MUTED = colors.HexColor("#5B7A99")
BORDER = colors.HexColor("#DCE6E4")
SURFACE_2 = colors.HexColor("#EEF3F2")

PDF_ROW_LIMIT = 2000


def build_xlsx(headers: Sequence[str], rows: Sequence[Sequence], sheet_title: str = "Dane") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]  # Excel sheet name limit
    ws.append(list(headers))
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append(list(row))
    for col in ws.columns:
        values = [str(c.value) for c in col if c.value is not None]
        width = max((len(v) for v in values), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(width + 2, 40)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_pdf(
    title: str,
    subtitle: str,
    headers: Sequence[str],
    rows: Sequence[Sequence],
    summary: Optional[List[Tuple[str, str]]] = None,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=title, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph(title, styles["Title"]),
        Paragraph(subtitle, styles["Normal"]),
        Spacer(1, 0.5 * cm),
    ]

    if summary:
        summary_table = Table([[k, v] for k, v in summary], colWidths=[6 * cm, 6 * cm])
        summary_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), INK_MUTED),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 0.6 * cm))

    truncated = len(rows) > PDF_ROW_LIMIT
    display_rows = rows[:PDF_ROW_LIMIT]

    table = Table([list(headers)] + [list(r) for r in display_rows], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SURFACE_2]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(table)

    if truncated:
        elements.append(Spacer(1, 0.4 * cm))
        elements.append(Paragraph(
            f"Pokazano pierwsze {PDF_ROW_LIMIT} z {len(rows)} wierszy. Pełny zbiór danych dostępny w eksporcie CSV/Excel.",
            styles["Italic"],
        ))

    doc.build(elements)
    return buf.getvalue()
