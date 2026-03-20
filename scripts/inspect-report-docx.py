"""Inspect user's Report project.docx (media + image rels)."""
import re
import struct
import xml.etree.ElementTree as ET
import zipfile
from io import BytesIO
from pathlib import Path

try:
	from PIL import Image
except ImportError:
	Image = None

DOCX = Path(r"d:\Emic-QDA\emicqda\report architect\Report project.docx")


def main() -> None:
	if not DOCX.is_file():
		print("NOT_FOUND:", DOCX)
		return
	with zipfile.ZipFile(DOCX) as z:
		rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
		root = ET.fromstring(rels)
		ns = {"a": "http://schemas.openxmlformats.org/package/2006/relationships"}
		print("Image relationships:")
		for x in root.findall("a:Relationship", ns):
			if "image" in (x.get("Type") or ""):
				print(" ", x.get("Id"), "->", x.get("Target"))

		doc = z.read("word/document.xml").decode("utf-8")
		print("r:embed in document:", len(re.findall(r'r:embed="rId', doc)))

		for name in sorted(z.namelist()):
			if not name.startswith("word/media/") or name.endswith("/"):
				continue
			raw = z.read(name)
			print("\n", name, len(raw), "bytes")
			if name.endswith(".png") and len(raw) >= 24:
				w, h = struct.unpack(">II", raw[16:24])
				print("  IHDR:", w, "x", h)
				if Image:
					im = Image.open(BytesIO(raw)).convert("RGB")
					px = list(im.getdata())
					nw = sum(1 for c in px if c != (255, 255, 255))
					print(
						"  non-white pixels:",
						nw,
						"of",
						len(px),
						"(",
						f"{100 * nw / max(1, len(px)):.4f}%",
						")",
					)
					if nw == 0:
						print("  NOTE: PNG is solid white — chart did not rasterize (empty image in Word).")


if __name__ == "__main__":
	main()
