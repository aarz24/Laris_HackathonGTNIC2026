"""Membangun proposal GTNIC 2026 menjadi DOCX (sumber yang bisa diedit) dan PDF.

Format mengikuti ketentuan lomba: A4, Times New Roman 12 pt, spasi 1,5,
margin kiri 4 cm serta atas/kanan/bawah 3 cm, maksimal 15 halaman.

Jalankan: C:\\Python313\\python.exe build_proposal.py
"""

from pathlib import Path
from html import escape
import json
import re

import pymupdf
from PIL import Image as PILImage, ImageDraw

import docx
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                                NextPageTemplate, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

import content

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

WIN_FONTS = Path(r"C:\Windows\Fonts")
USABLE_CM = 21.0 - 4.0 - 3.0  # 14 cm
BODY_PT = 12
LEADING = BODY_PT * 1.5
rl_config.useA85 = False

pdfmetrics.registerFont(TTFont("TNR", str(WIN_FONTS / "times.ttf")))
pdfmetrics.registerFont(TTFont("TNR-Bold", str(WIN_FONTS / "timesbd.ttf")))
pdfmetrics.registerFont(TTFont("TNR-Italic", str(WIN_FONTS / "timesi.ttf")))
pdfmetrics.registerFont(TTFont("TNR-BoldItalic", str(WIN_FONTS / "timesbi.ttf")))
pdfmetrics.registerFontFamily("TNR", normal="TNR", bold="TNR-Bold",
                              italic="TNR-Italic", boldItalic="TNR-BoldItalic")


def img_height_cm(name: str, width_cm: float) -> float:
    with PILImage.open(ASSETS / name) as im:
        w, h = im.size
    return width_cm * h / w


# --------------------------------------------------------------------------- #
# PDF
# --------------------------------------------------------------------------- #

S = {
    "body": ParagraphStyle("body", fontName="TNR", fontSize=BODY_PT, leading=LEADING,
                           alignment=TA_JUSTIFY, spaceAfter=6),
    "h1": ParagraphStyle("h1", fontName="TNR-Bold", fontSize=12, leading=18,
                         spaceBefore=12, spaceAfter=5, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="TNR-Bold", fontSize=12, leading=LEADING,
                         spaceBefore=8, spaceAfter=3, keepWithNext=1),
    "list": ParagraphStyle("list", fontName="TNR", fontSize=BODY_PT, leading=LEADING,
                           alignment=TA_JUSTIFY, leftIndent=18, bulletIndent=4,
                           bulletFontName="TNR", bulletFontSize=BODY_PT, spaceAfter=4),
    "cap": ParagraphStyle("cap", fontName="TNR-Italic", fontSize=12, leading=18,
                          alignment=TA_CENTER, spaceBefore=4, spaceAfter=10),
    "note": ParagraphStyle("note", fontName="TNR-Italic", fontSize=12, leading=18,
                           alignment=TA_JUSTIFY, leftIndent=8, rightIndent=8,
                           spaceBefore=4, spaceAfter=8,
                           textColor=colors.HexColor("#6b5a1f")),
    "cell": ParagraphStyle("cell", fontName="TNR", fontSize=12, leading=18),
    "cellh": ParagraphStyle("cellh", fontName="TNR-Bold", fontSize=12, leading=18),
    "cv_small": ParagraphStyle("cv_small", fontName="TNR", fontSize=12, leading=18,
                               alignment=TA_CENTER),
    "cv_mid": ParagraphStyle("cv_mid", fontName="TNR-Bold", fontSize=12, leading=18,
                             alignment=TA_CENTER),
    "cv_title": ParagraphStyle("cv_title", fontName="TNR-Bold", fontSize=12, leading=18,
                               alignment=TA_CENTER),
    "cv_logo": ParagraphStyle("cv_logo", fontName="TNR-Italic", fontSize=12, leading=18,
                              alignment=TA_CENTER,
                              textColor=colors.HexColor("#8a6d1d")),
}

TABLE_STYLE = TableStyle([
    ("FONTNAME", (0, 0), (-1, -1), "TNR"),
    ("FONTSIZE", (0, 0), (-1, -1), 12),
    ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#5a665e")),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dfeee5")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
])

COL_WIDTHS = {2: [5 * cm, 9 * cm], 3: [4 * cm, 5 * cm, 5 * cm]}


def plain(text, style, **kwargs):
    """Content is plain text, never ReportLab markup (including F&B)."""
    value = escape(text)
    if text.startswith("https://") and " " not in text:
        value = f'<link href="{value}" color="#174a76">{value}</link>'
    return Paragraph(value, style, **kwargs)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("TNR", 10)
    canvas.setFillColor(colors.HexColor("#555f57"))
    canvas.drawRightString(A4[0] - 3 * cm, 1.9 * cm, str(doc.page))
    canvas.restoreState()


def pdf_cover():
    m = content.META
    logo = Image(str(ASSETS / m["logo"]), width=5.5 * cm,
                 height=img_height_cm(m["logo"], 5.5) * cm)
    logo.hAlign = "CENTER"
    flow = [logo, Spacer(1, 0.6 * cm),
            Paragraph("PROPOSAL KARYA", S["cv_mid"]),
            Paragraph(m["competition"], S["cv_mid"]),
            Paragraph(m["category"], S["cv_small"]),
            Paragraph(m["subtheme"], S["cv_small"]),
            Spacer(1, 1.5 * cm),
            plain(m["title"], S["cv_title"]),
            Spacer(1, 1.4 * cm),
            Paragraph(f"Nama Tim: <b>{escape(m['team'])}</b>", S["cv_small"]),
            Spacer(1, 0.3 * cm)]
    for member in m["members"]:
        flow.append(plain(member, S["cv_small"]))
    flow.append(Spacer(1, 1.2 * cm))
    rows = [[plain(label, S["cellh"]), plain(value, S["cell"])]
            for label, value in m["links"]]
    table = Table(rows, colWidths=[3.6 * cm, 10.4 * cm], hAlign="CENTER")
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "TNR"),
        ("FONTSIZE", (0, 0), (-1, -1), 12),
        ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#5a665e")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    flow += [table, Spacer(1, 1.0 * cm),
             Paragraph(m["footer_note"], S["cv_logo"]),
             NextPageTemplate("body"), PageBreak()]
    return flow


def pdf_blocks(blocks):
    flow = []
    counter = 0
    for b in blocks:
        kind = b["t"]
        if kind == "h1":
            counter = 0
            flow.append(plain(b["x"], S["h1"]))
        elif kind == "h2":
            counter = 0
            flow.append(plain(b["x"], S["h2"]))
        elif kind == "p":
            counter = 0
            flow.append(plain(b["x"], S["body"]))
        elif kind == "b":
            counter = 0
            flow.append(plain(b["x"], S["list"], bulletText="\u2022"))
        elif kind == "n":
            counter += 1
            flow.append(plain(b["x"], S["list"], bulletText=f"{counter}."))
        elif kind == "placeholder":
            counter = 0
            flow.append(plain(b["x"], S["note"]))
        elif kind == "ref":
            counter = 0
            flow.append(Paragraph(
                f'<link href="{escape(b["url"], quote=True)}" color="#174a76">'
                f'{escape(b["x"])}</link>', S["body"]))
        elif kind == "img":
            counter = 0
            w = min(b["w"], USABLE_CM)
            pic = Image(str(ASSETS / b["f"]), width=w * cm,
                        height=img_height_cm(b["f"], w) * cm)
            pic.hAlign = "CENTER"
            group = [pic, plain(b["cap"], S["cap"])]
            while flow and isinstance(flow[-1], Paragraph) and getattr(flow[-1].style, "keepWithNext", False):
                group.insert(0, flow.pop())
            flow.append(KeepTogether(group))
        elif kind == "table":
            counter = 0
            rows = [[plain(c, S["cellh"]) for c in b["head"]]]
            rows += [[plain(c, S["cell"]) for c in r] for r in b["rows"]]
            widths = ([w * cm for w in b["widths"]] if "widths" in b
                      else COL_WIDTHS[len(b["head"])])
            table = Table(rows, colWidths=widths, hAlign="CENTER", repeatRows=1)
            table.setStyle(TABLE_STYLE)
            group = [table, plain(b["cap"], S["cap"])]
            while flow and isinstance(flow[-1], Paragraph) and getattr(flow[-1].style, "keepWithNext", False):
                group.insert(0, flow.pop())
            flow.append(KeepTogether(group))
        else:
            raise ValueError(f"blok tidak dikenal: {kind}")
    return flow


def build_pdf(path: Path, flow):
    doc = BaseDocTemplate(str(path), pagesize=A4,
                          leftMargin=4 * cm, rightMargin=3 * cm,
                          topMargin=3 * cm, bottomMargin=3 * cm,
                          title=content.META["title"],
                          author=content.META["team"],
                          initialFontName="TNR", initialFontSize=12, initialLeading=18)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame]),
        PageTemplate(id="body", frames=[frame], onPage=footer),
    ])
    doc.build(flow)


# --------------------------------------------------------------------------- #
# DOCX
# --------------------------------------------------------------------------- #

def docx_setup(document):
    section = document.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.left_margin = Cm(4)
    section.right_margin = Cm(3)
    section.top_margin = Cm(3)
    section.bottom_margin = Cm(3)

    normal = document.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(BODY_PT)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    pf = normal.paragraph_format
    pf.line_spacing = 1.5
    pf.space_after = Pt(6)
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    for name in ("Heading 1", "Heading 2", "Caption"):
        style = document.styles[name]
        style.font.name = "Times New Roman"
        style.font.color.rgb = RGBColor(0x1A, 0x20, 0x1D)
        style.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    document.styles["Heading 1"].font.size = Pt(12)
    document.styles["Heading 2"].font.size = Pt(12)
    document.styles["Caption"].font.size = Pt(12)
    for name in ("Heading 1", "Heading 2", "Caption", "List Bullet", "List Number"):
        document.styles[name].paragraph_format.line_spacing = 1.5
    normal.paragraph_format.widow_control = True
    document.styles["Caption"].font.italic = True
    return section


def docx_page_number_footer(section):
    paragraph = section.footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)
    run.font.name = "Times New Roman"
    run.font.size = Pt(10)


def docx_para(document, text, *, style=None, align=None, bold=False, italic=False,
              size=None, spacing=1.5, space_after=6, indent=None):
    p = document.add_paragraph(style=style)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.name = "Times New Roman"
    if size:
        run.font.size = Pt(size)
    p.paragraph_format.line_spacing = spacing
    p.paragraph_format.space_after = Pt(space_after)
    if align is not None:
        p.alignment = align
    if indent is not None:
        p.paragraph_format.left_indent = Cm(indent)
    return p


def docx_table(document, head, rows, widths=None):
    table = document.add_table(rows=1, cols=len(head))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    widths = widths or [w / cm for w in COL_WIDTHS[len(head)]]
    for col, width in zip(table.columns, widths):
        col.width = Cm(width)
    repeat = OxmlElement("w:tblHeader")
    table.rows[0]._tr.get_or_add_trPr().append(repeat)
    for cell, label in zip(table.rows[0].cells, head):
        cell.text = ""
        run = cell.paragraphs[0].add_run(label)
        run.bold = True
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"
        cell.paragraphs[0].paragraph_format.line_spacing = 1.5
    for row in rows:
        cells = table.add_row().cells
        for cell, value in zip(cells, row):
            cell.text = ""
            run = cell.paragraphs[0].add_run(value)
            run.font.size = Pt(12)
            run.font.name = "Times New Roman"
            cell.paragraphs[0].paragraph_format.line_spacing = 1.5
    for row in table.rows:
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for cell, width in zip(row.cells, widths):
            cell.width = Cm(width)
    return table


def build_docx(path: Path):
    m = content.META
    document = docx.Document()
    section = docx_setup(document)

    center = WD_ALIGN_PARAGRAPH.CENTER
    logo = document.add_paragraph()
    logo.alignment = center
    logo.add_run().add_picture(str(ASSETS / m["logo"]), width=Cm(5.5))
    docx_para(document, "PROPOSAL KARYA", align=center, bold=True, size=12, space_after=0)
    docx_para(document, m["competition"], align=center, bold=True, size=12, space_after=0)
    docx_para(document, m["category"], align=center, space_after=0)
    docx_para(document, m["subtheme"], align=center, space_after=30)
    docx_para(document, m["title"], align=center, bold=True, size=12, space_after=36)
    docx_para(document, f"Nama Tim: {m['team']}", align=center, bold=True, space_after=6)
    for member in m["members"]:
        docx_para(document, member, align=center, space_after=0)
    docx_para(document, "", align=center, space_after=18)
    docx_table(document, ["Keterangan", "Tautan"], [list(x) for x in m["links"]])
    docx_para(document, "", space_after=12)
    docx_para(document, m["footer_note"], align=center, italic=True)

    document.add_section(WD_SECTION.NEW_PAGE)
    body = document.sections[1]
    body.page_width, body.page_height = Cm(21), Cm(29.7)
    body.left_margin, body.right_margin = Cm(4), Cm(3)
    body.top_margin, body.bottom_margin = Cm(3), Cm(3)
    body.footer.is_linked_to_previous = False
    docx_page_number_footer(body)

    counter = 0
    for b in content.BLOCKS:
        kind = b["t"]
        if kind == "h1":
            counter = 0
            document.add_heading(b["x"], level=1)
        elif kind == "h2":
            counter = 0
            document.add_heading(b["x"], level=2)
        elif kind == "p":
            counter = 0
            docx_para(document, b["x"])
        elif kind == "b":
            counter = 0
            docx_para(document, b["x"], style="List Bullet", space_after=4)
        elif kind == "n":
            counter += 1
            docx_para(document, f"{counter}. {b['x']}", indent=0.6, space_after=4)
        elif kind == "placeholder":
            counter = 0
            docx_para(document, b["x"], italic=True, size=12, indent=0.5)
        elif kind == "ref":
            counter = 0
            p = docx_para(document, "")
            link = OxmlElement("w:hyperlink")
            relation = document.part.relate_to(b["url"],
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
                is_external=True)
            link.set(qn("r:id"), relation)
            run = OxmlElement("w:r")
            text = OxmlElement("w:t")
            text.text = b["x"]
            run.append(text)
            link.append(run)
            p._p.append(link)
        elif kind == "img":
            counter = 0
            w = min(b["w"], USABLE_CM)
            p = document.add_paragraph()
            p.alignment = center
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.keep_with_next = True
            p.add_run().add_picture(str(ASSETS / b["f"]), width=Cm(w))
            cap = document.add_paragraph(b["cap"], style="Caption")
            cap.alignment = center
            cap.paragraph_format.line_spacing = 1.5
            cap.paragraph_format.space_after = Pt(10)
        elif kind == "table":
            counter = 0
            docx_table(document, b["head"], b["rows"], b.get("widths"))
            cap = document.add_paragraph(b["cap"], style="Caption")
            cap.alignment = center
            cap.paragraph_format.line_spacing = 1.5
            cap.paragraph_format.space_after = Pt(10)

    document.save(str(path))
    return section


# --------------------------------------------------------------------------- #
# Surat pernyataan keaslian karya (dokumen terpisah)
# --------------------------------------------------------------------------- #

def pledge_blocks():
    p = content.PLEDGE
    flow = [Paragraph(f"<b>{p['title']}</b>",
                      ParagraphStyle("pt", parent=S["cv_title"], fontSize=14, leading=22)),
            Spacer(1, 0.4 * cm), plain(p["intro"], S["body"]), Spacer(1, 0.1 * cm)]
    rows = [[plain(label, S["cellh"]), plain(value, S["cell"])]
            for label, value in p["fields"]]
    table = Table(rows, colWidths=[3.6 * cm, 10.4 * cm], hAlign="LEFT")
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("FONTNAME", (0, 0), (-1, -1), "TNR"),
                               ("FONTSIZE", (0, 0), (-1, -1), 12),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    flow += [table, Spacer(1, 0.3 * cm),
             Paragraph("Dengan ini menyatakan bahwa:", S["body"])]
    for i, statement in enumerate(p["statements"], 1):
        flow.append(Paragraph(statement, S["list"], bulletText=f"{i}."))
    flow += [Spacer(1, 0.2 * cm), plain(p["closing"], S["body"]),
             Spacer(1, 0.2 * cm)]
    right = ParagraphStyle("right", parent=S["body"], alignment=2, spaceAfter=0)
    flow.append(KeepTogether([Paragraph(escape(sline) if sline else "&nbsp;", right)
                              for sline in p["signature"]]))
    return flow


def build_pledge_docx(path: Path):
    p = content.PLEDGE
    document = docx.Document()
    docx_setup(document)
    docx_para(document, p["title"], align=WD_ALIGN_PARAGRAPH.CENTER, bold=True,
              size=14, space_after=18)
    docx_para(document, p["intro"])
    docx_table(document, ["Keterangan", "Isi"], [list(x) for x in p["fields"]])
    docx_para(document, "", space_after=6)
    docx_para(document, "Dengan ini menyatakan bahwa:")
    for number, statement in enumerate(p["statements"], 1):
        docx_para(document, f"{number}. {statement}", indent=0.6, space_after=4)
    docx_para(document, p["closing"], space_after=18)
    for sline in p["signature"]:
        docx_para(document, sline or "", align=WD_ALIGN_PARAGRAPH.RIGHT, space_after=0)
    document.save(str(path))


def validate_pdf(path: Path):
    """Check the submission PDF and render a contact sheet for visual inspection."""
    failures = []
    pages = []
    with pymupdf.open(path) as pdf:
        if len(pdf) > 15:
            failures.append(f"Page limit exceeded: {len(pdf)} > 15")
        sheet = PILImage.new("RGB", (3 * 310, ((len(pdf) + 2) // 3) * 450), "#dddddd")
        draw = ImageDraw.Draw(sheet)
        for index, page in enumerate(pdf):
            if abs(page.rect.width - A4[0]) > 1 or abs(page.rect.height - A4[1]) > 1:
                failures.append(f"Page {index + 1}: not A4")
            spans = [s for b in page.get_text("dict")["blocks"] if "lines" in b
                     for line in b["lines"] for s in line["spans"]]
            for span in spans:
                x0, y0, x1, y1 = span["bbox"]
                if y0 > A4[1] - 3 * cm and span["text"].isdigit():
                    continue
                if x0 < 4 * cm - 2 or x1 > A4[0] - 3 * cm + 2 or y0 < 3 * cm - 2 or y1 > A4[1] - 3 * cm + 2:
                    failures.append(f"Page {index + 1}: text outside margins: {span['text'][:35]}")
                if abs(span["size"] - 12) > 0.1 or "TimesNewRoman" not in span["font"]:
                    failures.append(f"Page {index + 1}: unexpected font: {span['font']} {span['size']}")
            for info in page.get_image_info():
                x0, y0, x1, y1 = info["bbox"]
                if x0 < 4 * cm - 1 or x1 > A4[0] - 3 * cm + 1 or y0 < 3 * cm - 1 or y1 > A4[1] - 3 * cm + 1:
                    failures.append(f"Page {index + 1}: image outside margins")
            for font in page.get_fonts():
                if font[1] == "n/a":
                    failures.append(f"Page {index + 1}: unembedded font {font[3]}")
            pix = page.get_pixmap(matrix=pymupdf.Matrix(0.5, 0.5), alpha=False)
            preview = PILImage.frombytes("RGB", (pix.width, pix.height), pix.samples)
            x, y = (index % 3) * 310, (index // 3) * 450
            sheet.paste(preview, (x + 5, y + 20))
            draw.text((x + 8, y + 4), f"Page {index + 1}", fill="black")
            pages.append({"page": index + 1, "characters": len(page.get_text()),
                          "images": len(page.get_image_info())})
        sheet.save(OUT / "proposal-contact-sheet.png")
        pdf[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(OUT / "proposal-cover.png")
    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict):
            for item in value.values():
                yield from strings(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                yield from strings(item)
    pending = sorted({m for text in strings([content.META, content.BLOCKS])
                      for m in re.findall(r"\[[^\]]+\]", text) if m not in ("[1]", "[2]")})
    report = {"status": "DRAFT" if pending else "REQUIRES_MANUAL_SUBMISSION_CHECKS",
              "pdf": path.name, "pages": pages, "format_errors": failures,
              "pending_fields": pending, "body_font": "Times New Roman 12 pt",
              "line_spacing": 1.5, "margins_cm": {"left": 4, "top": 3, "right": 3, "bottom": 3},
              "logo_source": "Guide Book Web Dev (2).pdf, page 19",
              "docx_note": "Editable source; Word pagination is not certified by this PDF check."}
    (OUT / "validation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    if failures:
        raise ValueError("PDF validation failed:\n" + "\n".join(failures))
    print(f"PDF checks passed: {len(pages)} A4 pages; {len(pending)} unresolved fields.")


if __name__ == "__main__":
    from make_diagrams import official_logo
    if not (ASSETS / content.META["logo"]).exists():
        official_logo()
    proposal_pdf = OUT / "GTNIC2026_WebDev_NamaTim.pdf"
    build_pdf(proposal_pdf, pdf_cover() + pdf_blocks(content.BLOCKS))
    build_docx(OUT / "GTNIC2026_WebDev_NamaTim.docx")

    build_pdf(OUT / "Surat_Pernyataan_Keaslian_Karya.pdf",
              [NextPageTemplate("body")] + pledge_blocks())
    build_pledge_docx(OUT / "Surat_Pernyataan_Keaslian_Karya.docx")

    (OUT / "submission-checklist.txt").write_text(content.SUBMISSION_CHECKLIST, encoding="utf-8")
    validate_pdf(proposal_pdf)
    for f in sorted(OUT.iterdir()):
        if f.is_file():
            print(f"{f.name:44} {f.stat().st_size // 1024:>5} KB")
