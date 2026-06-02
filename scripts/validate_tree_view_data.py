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

DOMAIN_DIRS = [
    'criminal_procedure_hk',
    'criminal_law_hk',
    'hk_listing_and_listed_company_regulation',
    'tort_law_hk',
]

REGULATORY_TYPES = {'listing_rule_anchor', 'sehk_decision_seed', 'guidance_letter_seed',
                    'practice_note_anchor', 'textbook_seed', 'enforcement_seed',
                    'sfc_material_seed'}

NAV_TYPES = {'section_header', 'legal_issue', 'restricted_nsl', 'practice_direction',
             'flow_step', 'gap', 'gap_node', 'cross_reference',
             'defence', 'remedy'}

SUPPORT_TYPES = {'statute', 'case_seed', 'statutory_scheme', 'candidate_evidence'} | REGULATORY_TYPES
FLOW_NODE_TYPES = {'flow_step', 'legal_issue', 'statutory_scheme'}

SUPPORT_RELATIONSHIPS = {
    'statutory_anchor',
    'case_seed',
    'practice_direction_ref',
    'cross_reference',
    'listing_rule_anchor',
    'guidance_letter_seed',
    'sehk_decision_seed',
    'practice_note_anchor',
    'enforcement_seed',
    'sfc_material_seed',
    'flow_transition',
    'gap',
}

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

def validate_domain(domain_dir):
    base_dir = os.path.join(os.path.dirname(__file__), '..', 'data/legal_domain_packs/demo_maps', domain_dir)
    print(f'\n{"="*60}')
    print(f'Validating domain: {domain_dir}')
    print(f'Path: {base_dir}')

    consolidated_path = os.path.join(base_dir, 'consolidated.json')
    if not os.path.exists(consolidated_path):
        error(f'consolidated.json not found at {consolidated_path}')
        return

    manifest = load_json(consolidated_path)
    print(f'Title: {manifest.get("title", "unknown")}')
    print(f'Sections: {len(manifest.get("sections", []))}')

    flows_path = os.path.join(base_dir, manifest.get('flows_file', 'flows.json'))
    flows = []
    if os.path.exists(flows_path):
        flows_data = load_json(flows_path)
        flows = flows_data.get('flows', [])
        print(f'Flows: {len(flows)}')
    else:
        error(f'flows file not found: {flows_path}')

    domain_path = os.path.join(base_dir, 'domain.json')
    if os.path.exists(domain_path):
        domain = load_json(domain_path)
        print(f'Domain ID: {domain.get("domain_id", "unknown")}')
        status = domain.get('status', {})
        if not status.get('not_product_answer_layer'):
            warn('domain.json missing not_product_answer_layer flag')
        if not status.get('needs_hklii_verification') and not status.get('needs_official_source_verification'):
            warn('domain.json missing needs_hklii_verification or needs_official_source_verification flag')
    else:
        warn('domain.json not found')

    all_nodes = []
    all_edges = []
    node_by_id = {}
    node_ids = set()

    for section in manifest.get('sections', []):
        section_id = section.get('id')
        node_path = os.path.join(base_dir, section.get('node_file', ''))
        if os.path.exists(node_path):
            node_data = load_json(node_path)
            nodes = node_data.get('nodes', [])
            for n in nodes:
                nid = n.get('id')
                if nid in node_ids:
                    error(f'Duplicate node ID: {nid} (section {section_id}, domain {domain_dir})')
                node_ids.add(nid)
                node_by_id[nid] = n
            all_nodes.extend(nodes)
        else:
            error(f'Node file not found: {node_path}')

    for n in all_nodes:
        nid = n.get('id')
        if not n.get('type'):
            error(f'Node {nid} missing type field')
        if not n.get('label'):
            error(f'Node {nid} missing label field')
        if n.get('answer_layer_status') == 'product_answer_layer':
            error(f'Node {nid} has product_answer_layer set (should be not_product_answer_layer)')
        if n.get('authority_status') == 'verified':
            warn(f'Node {nid} claims verified authority')

    for section in manifest.get('sections', []):
        section_id = section.get('id')
        edge_path = os.path.join(base_dir, section.get('edge_file', ''))
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

    print(f'Nodes: {len(all_nodes)}, Edges: {len(all_edges)}')

    primary_children = {}
    support_parents = {}
    rendered_tree_ids = set()

    for e in all_edges:
        rel = e.get('relationship')
        frm = e.get('from')
        to = e.get('to')
        if rel == 'has_subtopic':
            primary_children.setdefault(frm, []).append(to)
        elif rel in SUPPORT_RELATIONSHIPS:
            support_parents.setdefault(to, []).append(frm)

    for n in all_nodes:
        nid = n.get('id')
        for ref in n.get('statute_refs', []):
            if ref not in node_ids:
                warn(f'Node {nid}: statute_ref "{ref}" does not match any node ID')
        for ref in n.get('case_seeds', []):
            if ref not in node_ids:
                warn(f'Node {nid}: case_seed "{ref}" does not match any node ID')
        for ref in n.get('listing_rule_refs', []):
            if ref not in node_ids:
                warn(f'Node {nid}: listing_rule_ref "{ref}" does not match any node ID')
        for ref in n.get('guidance_refs', []):
            if ref not in node_ids:
                warn(f'Node {nid}: guidance_ref "{ref}" does not match any node ID')
        for ref in n.get('cross_refs', []):
            if ref not in node_ids:
                warn(f'Node {nid}: cross_ref "{ref}" does not match any node ID')

    for section in manifest.get('sections', []):
        sid = section.get('id')
        has_header = any(n.get('section') == sid and n.get('type') == 'section_header' for n in all_nodes)
        if not has_header:
            error(f'Section {sid} ({section.get("title")}) has no section_header node')
        has_nodes = any(n.get('section') == sid for n in all_nodes)
        if not has_nodes:
            error(f'Section {sid} ({section.get("title")}) has no nodes')

    def mark_primary_tree(node_id):
        if node_id in rendered_tree_ids:
            return
        rendered_tree_ids.add(node_id)
        for child_id in primary_children.get(node_id, []):
            mark_primary_tree(child_id)

    for section in manifest.get('sections', []):
        sid = section.get('id')
        headers = [n for n in all_nodes if n.get('section') == sid and n.get('type') == 'section_header']
        for header in headers:
            mark_primary_tree(header.get('id'))

    for n in all_nodes:
        if n.get('type') == 'flow_step':
            rendered_tree_ids.add(n.get('id'))

    for n in all_nodes:
        nid = n.get('id')
        if n.get('type') in NAV_TYPES and nid not in rendered_tree_ids:
            error(f'Navigational node is not renderable in tree: {nid} ({n.get("type")})')

    for n in all_nodes:
        nid = n.get('id')
        if n.get('type') in SUPPORT_TYPES:
            referenced_by_field = any(
                nid in other.get('statute_refs', [])
                or nid in other.get('case_seeds', [])
                or nid in other.get('listing_rule_refs', [])
                or nid in other.get('guidance_refs', [])
                or nid in other.get('practice_direction_refs', [])
                or nid in other.get('cross_refs', [])
                for other in all_nodes
            )
            if nid not in support_parents and not referenced_by_field:
                warn(f'Support/audit node has no incoming relationship or ref: {nid}')

    for flow in flows:
        flow_id = flow.get('flow_id')
        for step_id in flow.get('steps', []):
            if step_id not in node_ids:
                error(f'Flow {flow_id}: step "{step_id}" does not match any node ID')
            elif node_by_id[step_id].get('type') not in FLOW_NODE_TYPES:
                error(f'Flow {flow_id}: step "{step_id}" is not a flow-compatible node')

    for n in all_nodes:
        ntype = n.get('type')
        required_status_fields = []
        if ntype in ('legal_issue', 'restricted_nsl'):
            required_status_fields = ['verification_status', 'authority_status', 'answer_layer_status']
        elif ntype == 'case_seed':
            required_status_fields = ['verification_status', 'authority_status']
        elif ntype == 'statute':
            required_status_fields = ['verification_status']
        elif ntype in REGULATORY_TYPES:
            required_status_fields = ['verification_status']
        for field in required_status_fields:
            if field not in n:
                error(f'Node {n.get("id")} missing required status field: {field}')

    all_nav_and_support = rendered_tree_ids | {n.get('id') for n in all_nodes if n.get('type') in SUPPORT_TYPES}
    if len(all_nav_and_support) < len(all_nodes):
        warn('Some nodes are neither renderable navigation nodes nor recognized support/audit nodes')

def main():
    for domain_dir in DOMAIN_DIRS:
        validate_domain(domain_dir)

    print(f'\n{"="*60}')
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
        print('ALL DOMAINS PASSED — all checks OK')

if __name__ == '__main__':
    main()
