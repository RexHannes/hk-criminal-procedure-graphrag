#!/bin/bash
set -e

cd ~/Desktop/hk-criminal-procedure-graphrag

echo "=== Initializing git repo ==="
git init

echo "=== Adding all files ==="
git add .

echo "=== Creating initial commit ==="
git commit -m "feat: HK criminal procedure GraphRAG map with interactive viewer

Complete knowledge graph covering all 12 sections of Hong Kong
criminal procedure: jurisdiction, investigation, bail, indictments,
trial, appeals, costs, practice directions, and NSL submap.

- ~280 nodes: legal issues, statutes, case seeds, flow steps
- ~400 edges: statutory anchors, case seeds, flow transitions
- 7 procedural flow chains with animated viewer
- Interactive vis-network graph viewer with section tree + search
- All nodes marked not_product_answer_layer, needs_hklii_verification"

echo "=== Creating GitHub repo ==="
gh repo create RexHannes/hk-criminal-procedure-graphrag --public --push --source=. --remote=origin

echo "=== Pushing to GitHub ==="
# If the above didn't push (older gh version), do it manually:
git branch -M main
git remote add origin https://github.com/RexHannes/hk-criminal-procedure-graphrag.git 2>/dev/null || true
git push -u origin main

echo ""
echo "=== Done ==="
echo "View at: https://github.com/RexHannes/hk-criminal-procedure-graphrag"
echo "Viewer:  http://localhost:8080/viewer/ (after: python3 -m http.server 8080)"
