const { composeCompanyFormsAnswer } = require("./company_forms");
const { composeCriminalLawAnswer } = require("./criminal_law");
const { composeCriminalProcedureAnswer } = require("./criminal_procedure");
const { composeGenericAnswer } = require("./generic");
const { composePiAnswer } = require("./pi");

function composeAnswer(context) {
  const domain = context?.domain || "generic";
  if (domain === "personal_injury") return composePiAnswer(context);
  if (domain === "criminal_law") return composeCriminalLawAnswer(context);
  if (domain === "criminal_procedure") return composeCriminalProcedureAnswer(context);
  if (domain === "company_forms") return composeCompanyFormsAnswer(context);
  return composeGenericAnswer(context);
}

module.exports = {
  composeAnswer,
  composeCompanyFormsAnswer,
  composeCriminalLawAnswer,
  composeCriminalProcedureAnswer,
  composeGenericAnswer,
  composePiAnswer,
};
