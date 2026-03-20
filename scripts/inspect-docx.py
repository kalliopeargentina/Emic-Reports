"""One-off: inspect Report project.docx from user path."""
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

DOCX = Path(r"d:\Emic-QDA\emicqda\report architect\Report project.docx")


def main() -> None:
	if not DOCX.is_file():
		print("NOT_FOUND:", DOCX)
		sys.exit(1)
	with zipfile.ZipFile(DOCX) as z:
		for name in sorted(z.namelist()):
			if name.startswith("word/media/") and not name.endswith("/"):
				data = z.read(name)
				print(name, len(data))
				if name.endswith(".png") and len(data) >= 24:
					print("  sig", data[:8])
					w, h = struct.unpack(">II", data[16:24])
					print("  IHDR", w, "x", h)

		doc = z.read("word/document.xml").decode("utf-8", errors="replace")
		# Drawing extents in EMU (English Metric Units)
		cx = re.findall(r'cx="(\d+)"', doc)
		cy = re.findall(r'cy="(\d+)"', doc)
		print("cx samples", cx[:12])
		print("cy samples", cy[:12])

		rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
		root = ET.fromstring(rels)
		ns = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
		for rel in root.findall("r:Relationship", ns):
			if "image" in (rel.get("Type") or ""):
				print("rel", rel.get("Id"), "->", rel.get("Target"))


def dump_embed_context() -> None:
	with zipfile.ZipFile(DOCX) as z:
		doc = z.read("word/document.xml").decode("utf-8", errors="replace")
	for rid in ("rId7", "rId8"):
		needle = f'r:embed="{rid}"'
		idx = doc.find(needle)
		print("===", rid, "idx", idx, "===")
		if idx >= 0:
			print(doc[max(0, idx - 300) : idx + 700])


def alpha_stats() -> None:
	import struct
	import zlib

	with zipfile.ZipFile(DOCX) as z:
		names = [n for n in z.namelist() if n.endswith(".png")]
		d = z.read(names[0])
	i = 8
	idat = b""
	w = h = 0
	while i < len(d):
		l = int.from_bytes(d[i : i + 4], "big")
		i += 4
		t = d[i : i + 4]
		i += 4
		c = d[i : i + l]
		i += l
		i += 4
		if t == b"IHDR":
			w, h = struct.unpack(">II", c[:8])
		elif t == b"IDAT":
			idat += c
		elif t == b"IEND":
			break
	raw = zlib.decompress(idat)
	stride = 1 + w * 4
	transparent = opaque = 0
	for row in range(h):
		rowd = raw[row * stride : (row + 1) * stride]
		pix = rowd[1:]
		for j in range(0, len(pix), 20):
			if j + 3 < len(pix):
				a = pix[j + 3]
				if a < 16:
					transparent += 1
				else:
					opaque += 1
	print("alpha sample transparent", transparent, "opaque", opaque)


if __name__ == "__main__":
	main()
	print()
	dump_embed_context()
	print()
	alpha_stats()
