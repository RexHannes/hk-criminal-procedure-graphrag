# Hong Kong Law of Equity and Trusts

This domain pack is a seed-layer doctrine map for Hong Kong equity and trusts.
It is intended for Casemap4/Casemap5 GraphRAG navigation, study, issue spotting,
and future evidence linking.

## Current Scope

- Fundamentals and maxims of equity
- Express trusts and creation requirements
- Charitable trusts
- Resulting trusts, including Quistclose issues
- Constructive trusts, CICT, bribes, knowing receipt and dishonest assistance
- Trustee duties, powers, exemption clauses and anti-Bartlett clauses
- Beneficiary rights and tracing
- Equitable defences, remedies and procedural issues
- Statutory seed anchors for Cap 29, Cap 2 and Cap 219
- Flow and gap nodes for future HKLII / official-source verification

## Safety Status

This pack is not a product answer layer. It contains textbook/doctrine skeleton
nodes, unverified case seeds and statutory seed anchors. Case seeds and statutory
anchors must be linked to verified HKLII or official e-Legislation proof before
legal reliance.

No node in this pack should be treated as answer-safe unless a later evidence
layer adds verified paragraph proof, source URLs, treatment status and human
review.

## Evidence-Layer Direction

Future work should link cases, paragraphs, statutory sections and proposition
cards to stable doctrine node IDs. The visible doctrine tree should remain clean:

```text
Domain -> Section -> Issue -> Principle
```

Cases, paragraph anchors, treatment edges and statutory text should appear in
the detail/audit panel or evidence layer, not as a cluttered graph of visible
case nodes.

## Validation

Run from the repository root:

```bash
python3 scripts/validate_tree_view_data.py
```

