import pdfplumber, sys

paths = [
    r"C:\Users\DELL\Desktop\Project PSE\Dev\Report Generation\Templates\ISO 27001 Docs\Standards docs\ISO 27001 Standard 2022.pdf",
    r"C:\Users\DELL\Desktop\Project PSE\Dev\Report Generation\Templates\ISO 27001 Docs\Standards docs\New 27002 International Standard.pdf",
]

for path in paths:
    print("=" * 80)
    print(f"FILE: {path.split(chr(92))[-1]}")
    print("=" * 80)
    with pdfplumber.open(path) as pdf:
        print(f"Total pages: {len(pdf.pages)}")
        for i, page in enumerate(pdf.pages[:10]):
            text = page.extract_text() or ""
            if text.strip():
                print(f"\n--- Page {i+1} ---")
                print(text[:2500])
    print()
