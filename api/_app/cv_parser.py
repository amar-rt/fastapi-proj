import io

import pymupdf
from docx import Document


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            text = "\n".join(page.get_text() for page in doc)
    elif name.endswith(".docx"):
        doc = Document(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            for row in table.rows:
                parts.append(" | ".join(c.text for c in row.cells))
        text = "\n".join(parts)
    elif name.endswith(".txt"):
        text = data.decode("utf-8", errors="ignore")
    else:
        raise ValueError("Upload a PDF, DOCX or TXT file")
    text = "\n".join(line.rstrip() for line in text.splitlines() if line.strip())
    if len(text) < 50:
        raise ValueError("Could not read text from this CV (is it a scanned image?)")
    return text
