from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from karibu_case_generation.export.app_kpack import export_app_kpack_file

LEVEL_LABEL = {
    1: "Level 1 · Core practice",
    2: "Level 2 · Guided reasoning",
    3: "Level 3 · Challenge",
}


def load_curriculum_tracks(curriculum_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(curriculum_path.read_text())
    return list(payload.get("tracks", []))


def export_chapter_packs(
    *,
    input_dir: Path,
    output_dir: Path,
    curriculum_path: Path,
    levels: list[int] | None = None,
    compile_walkable: bool = True,
) -> list[dict[str, Any]]:
    """Export one `.kpack` per curriculum chapter × difficulty level."""
    levels = levels or [1, 2, 3]
    output_dir.mkdir(parents=True, exist_ok=True)
    catalog: list[dict[str, Any]] = []

    for track in load_curriculum_tracks(curriculum_path):
        chapter_id = str(track["id"])
        title_base = str(track["title"])
        for level in levels:
            pack_id = f"{chapter_id}-l{level}"
            pack_title = f"{title_base} — {LEVEL_LABEL.get(level, f'Level {level}')}"
            output_path = output_dir / f"{pack_id}.kpack"
            stats = export_app_kpack_file(
                input_dir=input_dir,
                output_path=output_path,
                pack_id=pack_id,
                title=pack_title,
                difficulty_level=level,
                chapter_id=chapter_id,
                compile_walkable=compile_walkable,
            )
            size_kb = max(1, output_path.stat().st_size // 1024)
            catalog.append(
                {
                    "id": pack_id,
                    "title": title_base,
                    "subtitle": LEVEL_LABEL.get(level, f"Level {level}"),
                    "topic": title_base,
                    "level": level,
                    "chapter_id": chapter_id,
                    "case_count": stats["cases"],
                    "walkable_count": stats["walkable"],
                    "approx_size_kb": size_kb,
                    "bundled": False,
                    "storage_path": f"v1/{pack_id}.kpack",
                    "version": 1,
                }
            )
    catalog_path = output_dir / "pack-catalog.json"
    catalog_path.write_text(json.dumps({"packs": catalog}, indent=2) + "\n")
    return catalog
