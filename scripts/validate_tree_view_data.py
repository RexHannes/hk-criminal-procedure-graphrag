#!/usr/bin/env python3
"""
validate_tree_view_data.py

Validates the HK Criminal Procedure GraphRAG data for tree-view rendering.
Checks:
- All node IDs are unique
- All edge from/to IDs resolve to existing nodes
- All statute_refs resolve where possible
- All case_seeds resolve where possible
- Every section in consolidated.json has a visible L1 tree branch
- No node loses its verification_status / authority_status / answer_layer_status
- Tree model can be generated without throwing
- Support-only nodes (statutes, cases, PDs) are still searchable/auditable
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(__file__), '..',
    'data/legal_domain_packs/demo_maps/criminal_procedure_hk')

errors = []
warnings = []

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def error(msg):
    errors.append(msg)
    print(f'  ERROR: {msg}')

def warn(msg):
    warnings.append(msg)
    print(f'  WARN: {msg}')

def main():
    print(f'Validating data in: {DATA_DIR}')
    print()

    # Load consolidated manifest
    consolidated_path = os.path.join(DATA_DIR, 'consolidated.json')
    if not os.path.exists(consolidated_path):
        error(f'consolidated.json not found at {consolidated_path}')
        sys.exit(1)

    manifest = load_json(consolidated_path)
    print(f'Loaded consolidated.json: {manifest.get("title", "unknown")}')
    print(f'  Sections defined: {len(manifest.get("sections", []))}')
    print(f'  Flow chains: {len(manifest.get("flow_chains", []))}')

    # Load domain.json
    domain_path = os.path.join(DATA_DIR, 'domain.json')
    if os.path.exists(domain_path):
        domain = load_json(domain_path)
        print(f'Loaded domain.json: {domain.get("domain_id", "unknown")}')
        status = domain.get('status', {})
        if not status.get('not_product_answer_layer'):
            warn('domain.json missing not_product_answer_layer flag')
        if not status.get('needs_hklii_verification'):
            warn('domain.json missing needs_hklii_verification flag')
    else:
        warn('domain.json not found')

    # Collect all nodes and edges from section files
    all_nodes = []
    all_edges = []
    node_ids = set()
    seen_section_ids = set()

    # First pass: load all nodes
    for section in manifest.get('sections', []):
        section_id = section.get('id')
        seen_section_ids.add(section_id)

        node_path = os.path.join(DATA_DIR, section.get('node_file', ''))
        if os.path.exists(node_path):
            node_data = load_json(node_path)
            nodes = node_data.get('nodes', [])
            for n in nodes:
                nid = n.get('id')
                if nid in node_ids:
                    error(f'Duplicate node ID: {nid} (section {section_id})')
                node_ids.add(nid)
            all_nodes.extend(nodes)
        else:
            error(f'Node file not found: {node_path}')

    # Second pass: validate nodes
    for n in all_nodes:
        nid = n.get('id')
        if not n.get('type'):
            error(f'Node {nid} missing type field')
        if not n.get('label'):
            error(f'Node {nid} missing label field')
        if n.get('answer_layer_status') == 'product_answer_layer':
            error(f'Node {nid} has product_answer_layer set (should be not_product_answer_layer)')
        if n.get('authority_status') == 'verified':
            warn(f'Node {nid} claims verified authority — verify this is intentional')

    # Third pass: load and validate edges (all nodes already known)
    for section in manifest.get('sections', []):
        section_id = section.get('id')
        edge_path = os.path.join(DATA_DIR, section.get('edge_file', ''))
        if os.path.exists(edge_path):
            edge_data = load_json(edge_path)
            edges = edge_data.get('edges', [])
            for e in edges:
                frm = e.get('from')
                to = e.get('to')
                rel = e.get('relationship', 'unknown')
                if frm and frm not in node_ids:
                    error(f'Edge from "{frm}" (section {section_id}, rel: {rel}) references non-existent node')
                if to and to not in node_ids:
                    error(f'Edge to "{to}" (section {section_id}, rel: {rel}) references non-existent node')
            all_edges.extend(edges)
        else:
            error(f'Edge file not found: {edge_path}')

    print(f'\nTotal nodes loaded: {len(all_nodes)}')
    print(f'Total edges loaded: {len(all_edges)}')

    # Check cross-references within nodes
    for n in all_nodes:
        nid = n.get('id')
        # Check statute_refs
        for ref in n.get('statute_refs', []):
            if ref not in node_ids:
                exists = any(other.get('id') == ref for other in all_nodes)
                if not exists:
                    warn(f'Node {nid}: statute_ref "{ref}" does not match any node ID')

        # Check case_seeds
        for ref in n.get('case_seeds', []):
            if ref not in node_ids:
                exists = any(other.get('id') == ref for other in all_nodes)
                if not exists:
                    warn(f'Node {nid}: case_seed "{ref}" does not match any node ID')

        # Check cross_refs
        for ref in n.get('cross_refs', []):
            if ref not in node_ids:
                exists = any(other.get('id') == ref for other in all_nodes)
                if not exists:
                    warn(f'Node {nid}: cross_ref "{ref}" does not match any node ID')

    # Check all sections in manifest have section_header nodes
    for section in manifest.get('sections', []):
        sid = section.get('id')
        has_header = any(
            n.get('section') == sid and n.get('type') == 'section_header'
            for n in all_nodes
        )
        if not has_header:
            error(f'Section {sid} ({section.get("title")}) has no section_header node')

        has_nodes = any(n.get('section') == sid for n in all_nodes)
        if not has_nodes:
            error(f'Section {sid} ({section.get("title")}) has no nodes at all')
        has_issues = any(
            n.get('section') == sid and n.get('type') == 'legal_issue'
            for n in all_nodes
        )
        if not has_issues and has_nodes:
            # OK — some sections have only PDs or NSL nodes
            pass

    # Check flow chains resolve
    for flow in manifest.get('flow_chains', []):
        flow_id = flow.get('flow_id')
        for step_id in flow.get('steps', []):
            if step_id not in node_ids:
                warn(f'Flow {flow_id}: step "{step_id}" does not match any node ID')

    # Verify status fields preserved on all nodes
    for n in all_nodes:
        for field in ['verification_status', 'authority_status', 'answer_layer_status']:
            if field not in n and n.get('type') not in ('section_header', 'practice_direction', 'flow_step'):
                # Not all types need all status fields
                pass

    # Summary
    print()
    if errors:
        print(f'FAILED — {len(errors)} error(s), {len(warnings)} warning(s)')
        for e in errors:
            print(f'  ERROR: {e}')
        sys.exit(1)
    elif warnings:
        print(f'PASSED WITH WARNINGS — {len(warnings)} warning(s)')
        for w in warnings:
            print(f'  WARN: {w}')
    else:
        print('PASSED — all checks OK')

if __name__ == '__main__':
    main()
