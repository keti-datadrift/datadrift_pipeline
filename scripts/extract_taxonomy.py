"""Extract the supplied workbook without evaluating formulas or macros."""

import hashlib
import json
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


def extract(path):
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    sheets = {}
    with ZipFile(path) as z:
        strings = [
            "".join(si.itertext())
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("x:si", ns)
        ]
        rels = {
            r.attrib["Id"]: r.attrib["Target"]
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        }
        for sheet in ET.fromstring(z.read("xl/workbook.xml")).findall(
            "x:sheets/x:sheet", ns
        ):
            target = rels[
                sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
            ]
            member = target.lstrip("/") if target.startswith("/") else "xl/" + target
            rows = []
            for row in ET.fromstring(z.read(member)).findall("x:sheetData/x:row", ns):
                values = {}
                for cell in row.findall("x:c", ns):
                    value = cell.find("x:v", ns)
                    if value is None:
                        continue
                    text = (
                        strings[int(value.text)]
                        if cell.attrib.get("t") == "s"
                        else value.text
                    )
                    values["".join(c for c in cell.attrib["r"] if c.isalpha())] = text
                if values:
                    rows.append({"row": int(row.attrib["r"]), **values})
            sheets[sheet.attrib["name"]] = rows
    groups = {}
    for row in sheets["속성 텍소노미"][1:]:
        groups.setdefault(row["A"], {}).setdefault(row["B"], []).append(row["C"])
    colors = [
        {"group": r["B"], "code": r["C"], "name": r["D"], "row": r["row"]}
        for r in sheets["속성- 컬러"]
        if r["row"] >= 3
    ]
    categories = [
        {
            "major_code": r["A"],
            "major": r["B"],
            "middle_code": r["C"],
            "middle": r["D"],
            "code": r["E"],
            "name": r["F"],
            "gender": r.get("G", ""),
            "row": r["row"],
        }
        for r in sheets["카테고리"]
        if r["row"] >= 3
    ]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "id": "bkave-" + digest[:12],
        "name": "비케이브 Taxonomy",
        "source_filename": path.name,
        "source_sha256": digest,
        "groups": groups,
        "colors": colors,
        "categories": categories,
    }


if __name__ == "__main__":
    data = extract(Path(sys.argv[1]))
    Path(sys.argv[2]).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(
        data["id"],
        len(data["categories"]),
        len(data["colors"]),
        {k: len(v) for k, v in data["groups"].items()},
    )
