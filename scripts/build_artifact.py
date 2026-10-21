"""Assemble une page unique (sans balises html/head/body) pour l'aperçu privé sur claude.ai."""
import re, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
head = re.search(r"<!-- ARTIFACT-HEAD-START -->(.*)<!-- ARTIFACT-HEAD-END -->", html, re.S).group(1)
body = re.search(r"<!-- ARTIFACT-BODY-START -->(.*)<!-- ARTIFACT-BODY-END -->", html, re.S).group(1)
js = (root / "src" / "main.js").read_text()
body = body.replace('<script type="module" src="src/main.js"></script>', "<script type=\"module\">\n" + js + "\n</script>")
Path(sys.argv[1]).write_text(head.strip() + "\n" + body.strip() + "\n")
