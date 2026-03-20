"""Analyze DOCX embedded images (blank vs content). Usage: python scripts/analyze-docx-media.py <path.docx>"""
import collections
import io
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


def png_stats(data: bytes) -> dict:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return {"ok": False}
    w, h = struct.unpack(">II", data[16:24])
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(data)).convert("RGB")
        px = list(im.getdata())
        nonwhite = sum(1 for c in px if c != (255, 255, 255))
        return {"ok": True, "w": w, "h": h, "nonwhite": nonwhite, "total": len(px), "pct": 100.0 * nonwhite / len(px) if px else 0}
    except ImportError:
        return {"ok": True, "w": w, "h": h, "pil": "skip"}
    except Exception as e:
        return {"ok": True, "w": w, "h": h, "error": str(e)}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python analyze-docx-media.py <file.docx>")
        sys.exit(1)
    p = Path(sys.argv[1])
    if not p.is_file():
        print("NOT FOUND:", p)
        sys.exit(1)

    png_pct_by_zip_path: dict[str, float | None] = {}

    with zipfile.ZipFile(p) as z:
        media = sorted(n for n in z.namelist() if n.startswith("word/media/") and not n.endswith("/"))
        print(f"File: {p}")
        print(f"Media files: {len(media)}")
        for n in media:
            data = z.read(n)
            print(f"  {n}  bytes={len(data)}")
            if n.lower().endswith(".png"):
                s = png_stats(data)
                print(f"    PNG: {s}")
                pct = s.get("pct") if isinstance(s.get("pct"), (int, float)) else None
                png_pct_by_zip_path[n] = float(pct) if pct is not None else None
            elif n.lower().endswith((".jpg", ".jpeg")):
                try:
                    from PIL import Image

                    im = Image.open(io.BytesIO(data)).convert("RGB")
                    px = list(im.getdata())
                    nw = sum(1 for c in px if c != (255, 255, 255))
                    print(f"    JPEG: size={im.size} nonwhite={nw} pct={100*nw/len(px):.4f}")
                except Exception as e:
                    print(f"    JPEG decode: {e}")

        doc = z.read("word/document.xml").decode("utf-8", errors="replace")
        print(f"\n<w:drawing count: {doc.count('<w:drawing')}")
        rels = z.read("word/_rels/document.xml.rels").decode("utf-8", errors="replace")
        print(f"Image relationships in rels: {rels.count('relationships/image')}")

        # How often each image part is referenced (many uses + pct 0 => blank capture reused)
        embeds = re.findall(r'r:embed="(rId\d+)"', doc)
        use_count = collections.Counter(embeds)
        root = ET.fromstring(rels)
        ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
        rid_to_target: dict[str, str] = {}
        for rel in root.findall("r:Relationship", ns):
            t = rel.get("Type") or ""
            if "image" not in t:
                continue
            rid = rel.get("Id") or ""
            target = rel.get("Target") or ""
            rid_to_target[rid] = target

        print("\n--- Embed reuse (rId -> times used in document) ---")
        print("  rId   uses  word path              approx non-white % (PNG, needs PIL)")
        for rid, count in sorted(use_count.items(), key=lambda x: (-x[1], x[0])):
            target = rid_to_target.get(rid, "?")
            zip_path = f"word/{target}" if target and not target.startswith("word/") else target
            pct = png_pct_by_zip_path.get(zip_path)
            pct_s = f"{pct:.4f}" if pct is not None else "n/a"
            print(f"  {rid:5} {count:4}  {zip_path:22}  {pct_s}")
        if any(c > 1 for c in use_count.values()):
            print(
                "\nNote: Same rId used multiple times is normal when image BYTES are identical.",
                "If that rId maps to pct=0, all those placements are the same blank PNG.",
            )


if __name__ == "__main__":
    main()
