import type { CategoryDef, SubmissionData } from "@/lib/calculations";

export const categories: CategoryDef[] = [
  { id: "c-pers", code: "PERSONNEL", name: "Personnel", nameSo: "Kharashaadka shaqaalaha", kind: "EXPENDITURE", summaryGroup: "PERSONNEL", isCapital: false, procurementEligible: false, sortOrder: 1 },
  { id: "c-gs", code: "GOODS_SERVICES", name: "Goods and Services", nameSo: "Agabyada iyo adeegyada", kind: "EXPENDITURE", summaryGroup: "GOODS_SERVICES", isCapital: false, procurementEligible: true, sortOrder: 2 },
  { id: "c-basic", code: "BASIC_SERVICES", name: "Basic Services", nameSo: "Adeegyada aasaasiga ah", kind: "EXPENDITURE", summaryGroup: "OTHER", isCapital: false, procurementEligible: true, sortOrder: 3 },
  { id: "c-travel", code: "TRAVEL_TRANSPORT", name: "Travel and Transport", nameSo: "Safarka iyo gaadiidka", kind: "EXPENDITURE", summaryGroup: "OTHER", isCapital: false, procurementEligible: false, sortOrder: 4 },
  { id: "c-om", code: "OPERATIONS_MAINTENANCE", name: "Operations and Maintenance", nameSo: "Hawlgalka iyo dayactirka", kind: "EXPENDITURE", summaryGroup: "OTHER", isCapital: false, procurementEligible: false, sortOrder: 5 },
  { id: "c-other", code: "OTHER_RECURRENT", name: "Other Recurrent Expenditure", nameSo: "Kharashaad joogto ah oo kale", kind: "EXPENDITURE", summaryGroup: "OTHER", isCapital: false, procurementEligible: false, sortOrder: 6 },
  { id: "c-cap", code: "CAPITAL", name: "Capital Expenditure", nameSo: "Kharashaadka raasamaalka", kind: "EXPENDITURE", summaryGroup: "CAPITAL", isCapital: true, procurementEligible: true, sortOrder: 7 },
  { id: "r-tax", code: "TAXES", name: "Taxes", nameSo: "Cashuuraha", kind: "REVENUE", summaryGroup: null, isCapital: false, procurementEligible: false, sortOrder: 10 },
  { id: "r-fees", code: "FEES", name: "Fees", nameSo: "Ajuurooyinka iyo khidmadaha", kind: "REVENUE", summaryGroup: null, isCapital: false, procurementEligible: false, sortOrder: 11 },
  { id: "r-lic", code: "LICENSES", name: "Licenses", nameSo: "Rukhsadaha", kind: "REVENUE", summaryGroup: null, isCapital: false, procurementEligible: false, sortOrder: 12 },
  { id: "r-fines", code: "FINES", name: "Fines", nameSo: "Ganaaxyada", kind: "REVENUE", summaryGroup: null, isCapital: false, procurementEligible: false, sortOrder: 13 },
  { id: "r-other", code: "OTHER_REVENUE", name: "Other Revenue", nameSo: "Dakhli kale", kind: "REVENUE", summaryGroup: null, isCapital: false, procurementEligible: false, sortOrder: 14 },
];

/** A fully consistent submission: every consistency check passes. */
export function consistentSubmission(): SubmissionData {
  return {
    categories,
    formA: {
      agencyName: "10101 — Madaxtooyada",
      allocationNumber: "10101",
      agencyCategory: "Administrative Services",
      accountingOfficer: "Accounting Officer",
      contactPerson: "Budget Officer",
      telephone: "+252 90 000 0000",
      email: "budget@example.gov",
    },
    expenditureLines: [
      { categoryId: "c-pers", amount: 120_000 },
      { categoryId: "c-gs", amount: 30_000 },
      { categoryId: "c-basic", amount: 10_000 },
      { categoryId: "c-travel", amount: 5_000 },
      { categoryId: "c-om", amount: 4_000 },
      { categoryId: "c-other", amount: 1_000 },
    ],
    revenueLines: [
      { categoryId: "r-fees", amount: 200_000, priorYearActual: 150_000, currentYearEstimate: 170_000 },
      { categoryId: "r-lic", amount: 20_000, priorYearActual: 18_000, currentYearEstimate: 19_000 },
    ],
    capital: [
      {
        projectId: "p1",
        name: "Office rehabilitation",
        totalCost: 100_000,
        spentToDate: 20_000,
        allocation: 50_000,
        priorApproved: 40_000,
        fundingSourceId: "gov",
        expectedCompletionDate: "2027-12-31",
        justification: "Existing building is unsafe",
      },
    ],
    personnel: [
      { positionTitle: "Director", grade: "A", approvedEstablishment: 1, filledPositions: 1, monthlyCost: 2_000 },
      { positionTitle: "Officer", grade: "B", approvedEstablishment: 10, filledPositions: 8, monthlyCost: 1_000 },
    ],
    procurement: [
      { itemDescription: "Office supplies", estimatedCost: 20_000, quarter: "Q1", procurementMethodId: "rfq", budgetCategoryId: "c-gs" },
      { itemDescription: "Rehabilitation works", estimatedCost: 45_000, quarter: "Q2", procurementMethodId: "open", capitalProjectId: "p1" },
    ],
    cashFlow: [
      { quarter: "Q1", amount: 55_000 },
      { quarter: "Q2", amount: 55_000 },
      { quarter: "Q3", amount: 55_000 },
      { quarter: "Q4", amount: 55_000 },
    ],
    baseline: {
      expenditureByCategory: { "c-pers": 110_000, "c-gs": 25_000, "c-basic": 10_000, "c-travel": 5_000, "c-om": 4_000, "c-other": 1_000 },
      revenueByCategory: { "r-fees": 180_000, "r-lic": 20_000 },
      capitalApproved: 40_000,
    },
    notes: { "D:c-gs": "New office consumables contract" },
  };
}
