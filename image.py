#!/usr/bin/env python3
"""
image.py — Point d'entrée CLI pour générer les images de ligue SWU
===================================================================

Usage:
    python image.py                            # images pour toutes les boutiques (set courant)
    python image.py -b cercle-du-jeu           # images pour une boutique spécifique
    python image.py -s set-7                   # images pour un set spécifique
"""

import argparse
import sys
from pathlib import Path

from data import available_steps, SHOPS, SETS, CURRENT_SET
from drawing import generate_step_image
from theme import OUTPUT_DIR


def generate_all_images(set_id: str, shop: str) -> list[Path]:
    steps = available_steps(set_id, shop)
    if not steps:
        print(f"Aucun fichier d'étape trouvé dans data/{set_id}/{shop}/")
        sys.exit(1)
    out_dir = OUTPUT_DIR / set_id / shop
    return [generate_step_image(set_id, shop, step, out_dir) for step in steps]


def generate_all_shops(set_id: str) -> list[Path]:
    all_paths = []
    for shop in SHOPS:
        steps = available_steps(set_id, shop)
        if not steps:
            continue
        out_dir = OUTPUT_DIR / set_id / shop
        for step in steps:
            all_paths.append(generate_step_image(set_id, shop, step, out_dir))
    return all_paths


def main():
    parser = argparse.ArgumentParser(
        prog="image",
        description="Génère les images classement + étape pour chaque étape jouée",
    )
    parser.add_argument(
        "-s", "--set",
        default=CURRENT_SET,
        choices=SETS.keys(),
        metavar="SET",
        help=f"Slug du set (défaut : {CURRENT_SET})",
    )
    parser.add_argument(
        "-b", "--boutique",
        default=None,
        choices=SHOPS.keys(),
        metavar="SLUG",
        help="Slug de la boutique (sans -b : génère toutes les boutiques)",
    )
    args = parser.parse_args()
    set_id = args.set
    if args.boutique:
        paths = generate_all_images(set_id, args.boutique)
    else:
        paths = generate_all_shops(set_id)
    for webp in paths:
        print(f"  {webp}")


if __name__ == "__main__":
    main()
