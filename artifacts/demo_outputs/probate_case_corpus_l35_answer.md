# Probate L1-L3.5 Case-Corpus Boundary Memo

## Product Mode

- Mode: `demo_supported`
- Answer safe: `false`
- Lawyer review required: `true`

## Case-Corpus Research

# Unsupported Case-Corpus Research Query

## Short Answer
- No source-grounded case-corpus authority is attached for this query in the sample L1-L3.5 corpus.

## Issues
- The query is outside the current sample case-corpus issue map, or the relevant vertical remains statute-first.

## Governing Law / Elements
- No case-corpus governing law is asserted.

## Case-by-Case Authorities
- No case-by-case authority is attached in the sample L1-L3.5 corpus.

## Extracted Legal Principles
- No extracted case principle is available for this query.

## Application to User Facts
- No case-law application is made because the sample corpus has no mapped authority for this query.

## Evidence Analysis
- No uploaded evidence text was supplied for this case-corpus memo. User facts remain separate from legal authority.

## Missing Facts
- Supported issue id, paragraph proof, proposition/principle extraction and lawyer review.

## Practical Next Steps
- Build or load a source-grounded vertical pack before answering.
- Do not cite case law as authority without paragraph cards and exact quote support.

## Source Audit
- L1 registry cases: 120
- L2 paragraph cards: 344
- L3 propositions/principles: 688
- L3.5 digests returned: 0
- L4 answer-safe propositions: not implemented.
- All case-corpus outputs are research_only / lawyer_review_required.

## Full Answer Markdown

# Legal Research Answer - Probate Intestacy Distribution

## Short Answer
Do not answer this as a will/executor form question. It is an intestacy distribution question first: identify the governing law, whether a surviving spouse exists, and whether the granddaughters' parent predeceased the deceased. If Hong Kong intestacy applies and there is no surviving spouse, the estate is held on statutory trusts for issue; living children take at the child level, and grandchildren take only through a deceased parent's branch. Any minor beneficiary's share must be administered through the relevant trust/guardian route until full age or another statutory vesting condition is met.

## Issues
- Whether Hong Kong intestacy law applies at all, given the US death/foreign-connection facts.
- Whether there is a valid surviving spouse before any issue-only distribution is calculated.
- Whether the son, daughter and granddaughters take directly or by branch under the statutory trusts.
- Whether any beneficiary is under 18 and therefore needs administration/trust handling rather than simple payment.

## Governing Law / Elements
- The Intestates' Estates Ordinance (Cap. 73) is the Hong Kong statute used for this source-gated intestacy distribution demo.
- Cap. 73 s.2 defines the intestacy/residuary-estate frame after proper expenses and liabilities.
- Cap. 73 s.3 is the spouse-validity gate; it is not the statutory-trusts provision.
- Cap. 73 s.4 governs succession to the residuary estate on intestacy, including the no-spouse/issue branch.
- Cap. 73 s.5 is the statutory-trusts provision for issue, including stocks and the rule that issue do not take while their parent is living and capable of taking.
- Cap. 73 s.9 makes the personal representative trustee of the residuary estate for beneficially entitled persons.
- Cap. 410 s.2 supplies the full-age-at-18 anchor.

## Relevant Authorities
- No probate case digest card is attached because this demo is statute-led and no public HKLII/LegalRef probate paragraph authority has yet been verified for this exact distribution fact pattern.
- Intestates’ Estates Ordinance (Cap. 73) s.2 - Interpretation. Source: https://www.elegislation.gov.hk/hk/cap73/s2
- Intestates’ Estates Ordinance (Cap. 73) s.3 - Valid marriage. Source: https://www.elegislation.gov.hk/hk/cap73/s3
- Intestates’ Estates Ordinance (Cap. 73) s.4 - Succession to estate on intestacy. Source: https://www.elegislation.gov.hk/hk/cap73/s4
- Intestates’ Estates Ordinance (Cap. 73) s.5 - Statutory trusts for issue. Source: https://www.elegislation.gov.hk/hk/cap73/s5
- Intestates’ Estates Ordinance (Cap. 73) s.9 - Personal representative trustee. Source: https://www.elegislation.gov.hk/hk/cap73/s9
- Age of Majority (Related Provisions) Ordinance (Cap. 410) s.2 - Full age at 18. Source: https://www.elegislation.gov.hk/hk/cap410/s2

## Case-by-Case Authorities
- No case-by-case paragraph authority is attached for this scenario yet; do not present case law as answer authority until public paragraph cards are verified.

## Extracted Legal Principles
- The probate analysis must identify whether the deceased died intestate as to a beneficial interest and what counts as the residuary estate after proper expenses and liabilities. Source: Cap. 73 s.2; quote: "intestate includes a person who leaves a will but dies intestate as to some beneficial interest in his estate". Status: research_only.
- A spouse gate requires checking whether any surviving husband or wife was in a valid marriage for Cap. 73 purposes. Source: Cap. 73 s.3; quote: "valid marriage means a marriage celebrated or contracted in accordance with the Marriage Ordinance". Status: research_only.
- If the intestate leaves issue but no husband or wife, the residuary estate is held on statutory trusts for the issue. Source: Cap. 73 s.4(5); quote: "If the intestate leaves issue but no husband or wife the residuary estate of the intestate shall be held on the statutory trusts for the issue of the intestate.". Status: research_only.
- Children living at death take at the child level; issue of a predeceased child take that child’s share by stocks, and issue do not take if their parent is living and capable of taking. Source: Cap. 73 s.5(1)(a); quote: "no issue shall take whose parent is living at the death of the intestate and is so capable of taking". Status: research_only.
- The personal representative holds the intestate residuary estate as trustee for those beneficially entitled, subject to administration powers. Source: Cap. 73 s.9; quote: "the personal representative of any person dying intestate shall be a trustee for the persons beneficially entitled under this Ordinance". Status: research_only.
- A person attains full age at 18, which matters for minor-beneficiary administration and statutory trust vesting questions. Source: Cap. 410 s.2; quote: "a person shall attain full age on attaining the age of 18 years". Status: research_only.

## Application to User Facts
- If Hong Kong law applies and there is no surviving spouse, the son and daughter are alive, and the granddaughters' parent is also alive and capable of taking, the granddaughters do not take at that level because Cap. 73 s.5 blocks issue whose parent is living and capable of taking.
- If Hong Kong law applies, there is no surviving spouse, and a third child of the deceased predeceased leaving the two granddaughters, the son, daughter and the predeceased child's branch are analysed by stocks: son one branch, daughter one branch, and the granddaughters share their parent's branch, subject to minor-beneficiary administration.
- The 'former 18, later not' fact matters for administration/payment mechanics because Cap. 410 s.2 sets full age at 18 and Cap. 73 s.5 uses full age in statutory-trusts language.
- Forms and drafting should come after this classification; letters of administration and minor-beneficiary handling are downstream of the distribution analysis.

## Evidence Analysis
- Fact: death in the US / foreign connection. Legal relevance: may make domicile and asset situs decisive before Hong Kong intestacy distribution is applied.
- Fact: no will asserted. Legal relevance: supports intestacy routing, but the original will/codicil search and any foreign grant must still be verified.
- Fact: son, daughter and granddaughters are named. Legal relevance: requires a family tree proving whether the granddaughters' parent predeceased and whether that branch can take.
- Fact: one beneficiary is under 18. Legal relevance: affects administration/payment mechanics and possible guardian/co-administrator or trust handling.
- Evidence source audit: no death certificate, family-tree documents, grant papers or asset schedule is parsed in this response; those documents must be separately ingested before final advice.

## Missing Facts
- Deceased's domicile at death and whether the relevant assets are in Hong Kong, the US or another place.
- Whether there is any valid will, codicil, foreign grant or US estate proceeding.
- Whether there is a surviving spouse, former spouse, or matrimonial/property issue affecting distribution.
- Whether the two granddaughters' parent was a child of the deceased and whether that parent predeceased the deceased.
- Exact ages/capacity of the son, daughter and granddaughters, including which beneficiaries are under 18.
- Whether adoption, legitimacy, disclaimer, survivorship period, debts, funeral expenses, tax, or creditor issues alter the distributable estate.

## Practical Next Steps
- Confirm domicile at death, Hong Kong asset situs, and whether any US state proceeding or foreign grant exists.
- Confirm there is no valid will and no surviving spouse.
- Identify the parent through whom the granddaughters claim and whether that parent predeceased the deceased.
- Collect birth/adoption/marriage/death evidence before doing final arithmetic.
- Only then choose the letters-of-administration form route and any guardian/co-administrator or minor-share trust mechanics.

## Source Audit
- hk_probate_intestacy_definition_cap73_s2: source_verified_research_only (hk_cap73_s2_interpretation)
- hk_probate_spouse_gate_cap73_s3: source_verified_research_only (hk_cap73_s3_valid_marriage)
- hk_probate_intestacy_distribution_cap73_s4: source_verified_research_only (hk_cap73_s4_intestacy_succession)
- hk_probate_statutory_trusts_issue_cap73_s5: source_verified_research_only (hk_cap73_s5_statutory_trusts_issue)
- hk_probate_personal_representative_trustee_cap73_s9: source_verified_research_only (hk_cap73_s9_personal_representative_trustee)
- hk_probate_full_age_cap410_s2: source_verified_research_only (hk_cap410_s2_full_age_18)
- unsupported_1: unsupported_or_not_yet_answer_safe
- unsupported_2: unsupported_or_not_yet_answer_safe

## Documents / Forms
- For no-will/intestacy matters, do not use W1 probate-to-executor forms. Select the correct L1 letters-of-administration variant by entitlement/relationship/priority.
- Assets/liabilities material should use the grant schedule route: N2.1 and N4.1, with N2.2/N2.3/N4.2 only for correction/addition.
- Use L2 only for renunciation, and L3 forms only for nomination/power/guardian/co-administrator issues.

## Review Gate
- This Probate answer is source-gated legal research and workflow triage, not final legal advice.
- No Probate case proposition is answer-safe until public HKLII/LegalRef paragraph cards are attached and reviewed.
- Butterworths text and private form bodies remain private-vault-only and are not reproduced here.

---

# Unsupported Case-Corpus Research Query

## Short Answer
- No source-grounded case-corpus authority is attached for this query in the sample L1-L3.5 corpus.

## Issues
- The query is outside the current sample case-corpus issue map, or the relevant vertical remains statute-first.

## Governing Law / Elements
- No case-corpus governing law is asserted.

## Case-by-Case Authorities
- No case-by-case authority is attached in the sample L1-L3.5 corpus.

## Extracted Legal Principles
- No extracted case principle is available for this query.

## Application to User Facts
- No case-law application is made because the sample corpus has no mapped authority for this query.

## Evidence Analysis
- No uploaded evidence text was supplied for this case-corpus memo. User facts remain separate from legal authority.

## Missing Facts
- Supported issue id, paragraph proof, proposition/principle extraction and lawyer review.

## Practical Next Steps
- Build or load a source-grounded vertical pack before answering.
- Do not cite case law as authority without paragraph cards and exact quote support.

## Source Audit
- L1 registry cases: 120
- L2 paragraph cards: 344
- L3 propositions/principles: 688
- L3.5 digests returned: 0
- L4 answer-safe propositions: not implemented.
- All case-corpus outputs are research_only / lawyer_review_required.

## Request

```json
{
  "query": "If my father dies in US and does not have will, now left a son, a daughter and 2 granddaughters; one is 18 and the other is not, what happens?",
  "use_case_corpus": true,
  "case_corpus_mode": "sample",
  "issue_id": "probate.intestacy",
  "max_cases": 3,
  "max_paragraphs": 4
}
```

