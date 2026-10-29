#!/usr/bin/env python3
"""
combine_code.py
Combines all key source code files of the Red Bag Visualizer project into a single well-structured file.
Useful for codebase audits, code reviews, offline reference, and LLM context prompts.

Usage:
    python3 scripts/combine_code.py
    python3 scripts/combine_code.py --output all_code.md
    python3 scripts/combine_code.py --format text --output all_code.txt
    python3 scripts/combine_code.py --help
"""

import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

# Ordered list of core project source files
CORE_FILES = [
    "index.html",
    "package.json",
    "src/main.js",
    "src/data/products.js",
    "src/algo/packer3d.js",
    "src/algo/binpackAdapter.js",
    "src/scene/bagVisualizer.js",
    "src/scene/textures.js",
    "src/ui/controls.js",
    "src/style.css",
    "scripts/pack_red_bag.py"
]

# Extensions mapping to markdown code fence languages
EXT_TO_LANG = {
    ".js": "javascript",
    ".html": "html",
    ".css": "css",
    ".py": "python",
    ".json": "json",
    ".md": "markdown",
    ".sh": "bash"
}

# Directories and patterns to ignore when in auto-discovery mode
IGNORE_DIRS = {
    "node_modules", "dist", ".git", ".idea", ".vscode",
    "__pycache__", ".pytest_cache", ".agents", "brain"
}

IGNORE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".zip", ".tar",
    ".gz", ".lock", ".pyc"
}


def get_files_to_bundle(root_dir: Path, mode: str = "core") -> list[Path]:
    """Retrieve the list of files to bundle based on selected mode."""
    found_files = []

    if mode == "core":
        for rel_path in CORE_FILES:
            full_path = root_dir / rel_path
            if full_path.is_file():
                found_files.append(full_path)
            else:
                print(f"[Warning] Core file not found: {rel_path}", file=sys.stderr)
    else:  # auto-discover all code files
        for path in sorted(root_dir.rglob("*")):
            if not path.is_file():
                continue

            # Check if any parent part is in IGNORE_DIRS
            rel_parts = path.relative_to(root_dir).parts
            if any(part in IGNORE_DIRS for part in rel_parts):
                continue

            # Check extension
            if path.suffix.lower() in IGNORE_EXTENSIONS:
                continue

            # Ignore package-lock.json (too large)
            if path.name == "package-lock.json":
                continue

            found_files.append(path)

    return found_files


def generate_bundle(root_dir: Path, files: list[Path], output_format: str = "markdown") -> str:
    """Generate the combined string content for all files."""
    lines_output = []
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Header
    if output_format == "markdown":
        lines_output.append("# Red Bag 3D Visualizer — Consolidated Source Code")
        lines_output.append(f"> **Generated on:** {timestamp}  ")
        lines_output.append(f"> **Total Files:** {len(files)}  ")
        lines_output.append("")
        lines_output.append("---")
        lines_output.append("")
        lines_output.append("## Table of Contents")
        lines_output.append("")
        lines_output.append("| # | File Path | Lines | Size |")
        lines_output.append("|---|---|---|---|")
    else:
        border = "=" * 80
        lines_output.append(border)
        lines_output.append("RED BAG 3D VISUALIZER - CONSOLIDATED SOURCE CODE")
        lines_output.append(f"Generated on: {timestamp}")
        lines_output.append(f"Total Files: {len(files)}")
        lines_output.append(border)
        lines_output.append("")

    # Collect stats for table of contents
    file_contents = []
    total_lines = 0
    total_bytes = 0

    for idx, file_path in enumerate(files, 1):
        rel_path = file_path.relative_to(root_dir).as_posix()
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Skip binary files if any slipped through
            continue

        line_count = len(content.splitlines())
        byte_size = len(content.encode("utf-8"))
        total_lines += line_count
        total_bytes += byte_size

        file_contents.append((rel_path, file_path, content, line_count, byte_size))

        if output_format == "markdown":
            anchor = rel_path.replace("/", "").replace(".", "").replace("-", "").replace("_", "").lower()
            size_kb = f"{byte_size / 1024:.1f} KB"
            lines_output.append(f"| {idx} | [`{rel_path}`](#file-{anchor}) | {line_count:,} | {size_kb} |")
        else:
            lines_output.append(f"[{idx}] {rel_path} ({line_count:,} lines, {byte_size / 1024:.1f} KB)")

    if output_format == "markdown":
        lines_output.append("")
        lines_output.append(f"**Total Code Volume:** {total_lines:,} lines • {total_bytes / 1024:.1f} KB")
        lines_output.append("")
        lines_output.append("---")
        lines_output.append("")

    # Add each file's content
    for idx, (rel_path, file_path, content, line_count, byte_size) in enumerate(file_contents, 1):
        ext = file_path.suffix.lower()
        lang = EXT_TO_LANG.get(ext, "")
        anchor = rel_path.replace("/", "").replace(".", "").replace("-", "").replace("_", "").lower()

        if output_format == "markdown":
            lines_output.append(f"<a id=\"file-{anchor}\"></a>")
            lines_output.append(f"### File {idx}/{len(file_contents)}: `{rel_path}`")
            lines_output.append(f"*Lines: {line_count:,} • Size: {byte_size / 1024:.1f} KB*")
            lines_output.append("")
            lines_output.append(f"```{lang}")
            lines_output.append(content.rstrip())
            lines_output.append("```")
            lines_output.append("")
            lines_output.append("---")
            lines_output.append("")
        else:
            sep = "-" * 80
            lines_output.append(sep)
            lines_output.append(f"FILE {idx}/{len(file_contents)}: {rel_path}")
            lines_output.append(f"Lines: {line_count:,} | Size: {byte_size / 1024:.1f} KB")
            lines_output.append(sep)
            lines_output.append(content.rstrip())
            lines_output.append("\n\n")

    return "\n".join(lines_output)


def main():
    parser = argparse.ArgumentParser(
        description="Consolidate all main codebase files into a single file."
    )
    parser.add_argument(
        "-o", "--output",
        default="consolidated_codebase.md",
        help="Path to output file (default: consolidated_codebase.md)"
    )
    parser.add_argument(
        "-f", "--format",
        choices=["markdown", "text"],
        default="markdown",
        help="Output format: 'markdown' (.md) or 'text' (.txt) (default: markdown)"
    )
    parser.add_argument(
        "-a", "--all",
        action="store_true",
        help="Auto-discover all project text files instead of core files only"
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root directory (default: current directory)"
    )

    args = parser.parse_args()

    root_dir = Path(args.root).resolve()
    mode = "all" if args.all else "core"

    print(f"[*] Scanning project at: {root_dir}")
    print(f"[*] Mode: {mode.upper()} files")

    files = get_files_to_bundle(root_dir, mode=mode)
    if not files:
        print("[Error] No files found to bundle.", file=sys.stderr)
        sys.exit(1)

    print(f"[*] Found {len(files)} files to combine:")
    for f in files:
        print(f"    - {f.relative_to(root_dir)}")

    output_content = generate_bundle(root_dir, files, output_format=args.format)

    output_path = (root_dir / args.output) if not Path(args.output).is_absolute() else Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output_content, encoding="utf-8")

    file_size_kb = output_path.stat().st_size / 1024
    line_count = len(output_content.splitlines())

    print(f"[✓] Successfully bundled into: {output_path}")
    print(f"[✓] Total size: {file_size_kb:.1f} KB ({line_count:,} lines)")


if __name__ == "__main__":
    main()
