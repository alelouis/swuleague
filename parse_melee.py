"""Parse copié-collé de résultats melee.gg en CSV swuleague."""

import argparse
import csv
import re
import sys


def parse_melee(text: str) -> list[dict]:
    lines = [l.strip() for l in text.strip().splitlines()]

    # Skip header line if present
    if lines and lines[0].startswith("Rang"):
        lines = lines[1:]

    results = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Match rank number
        if re.match(r"^\d+$", line):
            i += 1
            if i >= len(lines):
                break
            # Player name (strip pronouns like "Il/Lui", "Il/Iel")
            joueur = re.sub(r"\s+(Il|Elle|Iel)/(Il|Lui|Elle|Iel)$", "", lines[i].strip())
            i += 1
            if i >= len(lines):
                break
            # Match record: W-L-D (possibly followed by other tab-separated columns)
            m = re.match(r"^(\d+)-(\d+)-(\d+)\b", lines[i].strip())
            if m:
                victoires, defaites, nuls = int(m.group(1)), int(m.group(2)), int(m.group(3))
                results.append({
                    "joueur": joueur,
                    "victoires": victoires,
                    "defaites": defaites,
                    "nuls": nuls,
                    "recrutement": 0,
                })
            i += 1
            # Skip remaining columns (game record, points, percentages)
            while i < len(lines) and not re.match(r"^\d+$", lines[i]):
                i += 1
        else:
            i += 1

    return results


def write_csv(results: list[dict], output: str | None):
    fieldnames = ["joueur", "victoires", "defaites", "nuls", "recrutement"]
    if output:
        with open(output, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)
        print(f"Écrit {len(results)} joueurs dans {output}")
    else:
        writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)


def main():
    parser = argparse.ArgumentParser(description="Parse melee.gg results into swuleague CSV")
    parser.add_argument("input", help="Fichier texte avec le copié-collé melee.gg")
    parser.add_argument("-o", "--output", help="Fichier CSV de sortie (défaut: stdout)")
    args = parser.parse_args()

    with open(args.input) as f:
        text = f.read()

    results = parse_melee(text)
    if not results:
        print("Aucun résultat trouvé.", file=sys.stderr)
        sys.exit(1)

    write_csv(results, args.output)


if __name__ == "__main__":
    main()
