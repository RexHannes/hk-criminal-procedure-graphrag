const COURT_SLUG = {
  HKCFA: "hkcfa",
  HKCFI: "hkcfi",
  HKCA: "hkca",
  HKDC: "hkdc",
  HKCT: "hkct",
  HKLDT: "hkldt",
  HKFC: "hkfc",
  HKSC: "hksc",
};

function hkliiUrlFromNeutralCitation(citation = "") {
  const match = String(citation).match(/\[\s*(\d{4})\s*\]\s*HK([A-Z]{2,6})\s+(\d+)\s*/i);
  if (!match) return "";
  const year = match[1];
  const court = match[2].toUpperCase();
  const num = match[3];
  const slug = COURT_SLUG[court];
  if (!slug) return "";
  return `https://www.hklii.hk/en/cases/${slug}/${year}/${num}`;
}

function preferredSourceUrl({ source_url, source_url_or_path, neutral_citation, law_report_citation, hklii_url } = {}) {
  if (hklii_url) return hklii_url;
  if (source_url) return source_url;
  if (source_url_or_path) return source_url_or_path;
  const fromNeutral = hkliiUrlFromNeutralCitation(neutral_citation);
  if (fromNeutral) return fromNeutral;
  return hkliiUrlFromNeutralCitation(law_report_citation) || "";
}

module.exports = {
  hkliiUrlFromNeutralCitation,
  preferredSourceUrl,
};
