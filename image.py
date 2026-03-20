#!/usr/bin/env python3
"""
image.py — Point d'entrée CLI pour générer les images de ligue SWU
===================================================================

Usage:
    python image.py                            # images pour toutes les boutiques
    python image.py -b cercle-du-jeu           # images pour une boutique spécifique
"""

import argparse
import sys

from data import available_steps, SHOPS
from drawing import generate_step_image
from theme import OUTPUT_DIR


def generate_all_images(shop: str) -> list[tuple]:
    steps = available_steps(shop)
    if not steps:
        print(f"Aucun fichier d'étape trouvé dans data/{shop}/")
        sys.exit(1)
    out_dir = OUTPUT_DIR / shop
    return [generate_step_image(shop, step, out_dir) for step in steps]


def generate_all_shops() -> list[tuple]:
    all_paths = []
    for shop in SHOPS:
        steps = available_steps(shop)
        if not steps:
            continue
        out_dir = OUTPUT_DIR / shop
        for step in steps:
            all_paths.append(generate_step_image(shop, step, out_dir))
    return all_paths


def main():
    parser = argparse.ArgumentParser(
        prog="image",
        description="Génère les images classement + étape pour chaque étape jouée",
    )
    parser.add_argument(
        "-b", "--boutique",
        default=None,
        choices=SHOPS.keys(),
        metavar="SLUG",
        help="Slug de la boutique (sans -b : génère toutes les boutiques)",
    )
    args = parser.parse_args()
    if args.boutique:
        paths = generate_all_images(args.boutique)
    else:
        paths = generate_all_shops()
    for png, webp in paths:
        print(f"  {png}  ({webp})")


if __name__ == "__main__":
    main()
