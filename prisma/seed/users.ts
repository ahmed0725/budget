/**
 * DEVELOPMENT SEED DATA — sample user accounts (isDevSeed = true).
 * Never use these accounts in production; delete them after go-live
 * (Administration → Users, filter "Development seed").
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { hashPassword } from "../../src/lib/auth/password";

/** Shared password of all development accounts (see README "Development accounts"). */
export const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? "Miisaaniyad#2027";

type Assignment = { mda: string; type: "BUDGET_OFFICER" | "FINANCE_OFFICER" | "ACCOUNTING_OFFICER" | "REVIEWER" | "VIEWER" };

export const DEV_USERS: { username: string; fullName: string; jobTitle: string; role: string; locale?: "en" | "so"; assignments?: Assignment[] }[] = [
  { username: "admin", fullName: "System Administrator", jobTitle: "ICT Systems Administrator", role: "SYSTEM_ADMIN" },
  { username: "budget.admin", fullName: "Hodan Cabdi Faarax", jobTitle: "Head of Budget Department", role: "BUDGET_ADMIN" },
  { username: "officer.10101", fullName: "Axmed Maxamed Cali", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", assignments: [{ mda: "10101", type: "BUDGET_OFFICER" }] },
  { username: "finance.10101", fullName: "Faadumo Xasan Nuur", jobTitle: "Director of Finance", role: "MDA_FINANCE_OFFICER", assignments: [{ mda: "10101", type: "FINANCE_OFFICER" }] },
  { username: "accounting.10101", fullName: "Cabdiraxmaan Yuusuf Warsame", jobTitle: "Director General (Accounting Officer)", role: "MDA_ACCOUNTING_OFFICER", assignments: [{ mda: "10101", type: "ACCOUNTING_OFFICER" }] },
  { username: "officer.10301", fullName: "Maryan Siciid Jaamac", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", assignments: [{ mda: "10301", type: "BUDGET_OFFICER" }] },
  { username: "officer.40101", fullName: "Khadar Cismaan Aadan", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", locale: "so", assignments: [{ mda: "40101", type: "BUDGET_OFFICER" }] },
  { username: "officer.40201", fullName: "Sahra Maxamuud Xuseen", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", assignments: [{ mda: "40201", type: "BUDGET_OFFICER" }] },
  { username: "officer.20501", fullName: "Cali Faarax Dualle", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", assignments: [{ mda: "20501", type: "BUDGET_OFFICER" }] },
  { username: "officer.30201", fullName: "Nimco Cabdullaahi Axmed", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", assignments: [{ mda: "30201", type: "BUDGET_OFFICER" }] },
  { username: "officer.30501", fullName: "Yaasiin Cumar Bille", jobTitle: "Budget Officer", role: "MDA_BUDGET_OFFICER", assignments: [{ mda: "30501", type: "BUDGET_OFFICER" }] },
  {
    username: "reviewer",
    fullName: "Ilhaan Ciise Samatar",
    jobTitle: "Senior Budget Officer, Ministry of Finance",
    role: "BUDGET_REVIEWER",
    assignments: ["10101", "10301", "40101", "40201", "20501", "30201", "30501"].map((mda) => ({ mda, type: "REVIEWER" as const })),
  },
  { username: "analyst", fullName: "Mustafe Jaamac Ducaale", jobTitle: "Budget Analyst", role: "BUDGET_ANALYST" },
  { username: "director", fullName: "Cabdiqaadir Xirsi Maxamed", jobTitle: "Director of Budget", role: "DIRECTOR" },
  { username: "approver", fullName: "Minister of Finance (Approval Authority)", jobTitle: "Minister of Finance", role: "APPROVAL_AUTHORITY" },
  { username: "executive", fullName: "Office of the President (Executive Viewer)", jobTitle: "Chief of Staff", role: "EXECUTIVE_VIEWER" },
  { username: "auditor", fullName: "Office of the Auditor General", jobTitle: "Senior Auditor", role: "AUDITOR" },
];

export async function seedUsers(prisma: PrismaClient) {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.key, r.id]));
  const mdas = new Map((await prisma.mda.findMany()).map((m) => [m.code, m.id]));
  const ids: Record<string, string> = {};
  for (const u of DEV_USERS) {
    const email = `${u.username}@budget.dev.local`;
    const user = await prisma.user.upsert({
      where: { username: u.username },
      create: {
        username: u.username,
        email,
        fullName: u.fullName,
        jobTitle: u.jobTitle,
        passwordHash,
        locale: u.locale ?? "en",
        isDevSeed: true,
        passwordChangedAt: new Date(),
        roles: { create: [{ roleId: roles.get(u.role)! }] },
      },
      update: {},
    });
    for (const a of u.assignments ?? []) {
      const mdaId = mdas.get(a.mda);
      if (!mdaId) continue;
      await prisma.userMdaAssignment.upsert({
        where: { userId_mdaId_type: { userId: user.id, mdaId, type: a.type } },
        create: { userId: user.id, mdaId, type: a.type },
        update: {},
      });
    }
    ids[u.username] = user.id;
  }

  // Development contact details for the MDAs used in the sample preparation cycle.
  const contacts: Record<string, { accountingOfficer: string; financeDirector: string; budgetOfficer: string; phone: string }> = {
    "10101": { accountingOfficer: "Cabdiraxmaan Yuusuf Warsame", financeDirector: "Faadumo Xasan Nuur", budgetOfficer: "Axmed Maxamed Cali", phone: "+252 90 700 1010" },
    "10301": { accountingOfficer: "Director General, Ministry of Finance", financeDirector: "Director of Finance", budgetOfficer: "Maryan Siciid Jaamac", phone: "+252 90 700 1030" },
    "40101": { accountingOfficer: "Director General, Ministry of Health", financeDirector: "Director of Finance", budgetOfficer: "Khadar Cismaan Aadan", phone: "+252 90 700 4010" },
    "40201": { accountingOfficer: "Director General, Ministry of Education", financeDirector: "Director of Finance", budgetOfficer: "Sahra Maxamuud Xuseen", phone: "+252 90 700 4020" },
    "20501": { accountingOfficer: "Police Commissioner", financeDirector: "Director of Finance", budgetOfficer: "Cali Faarax Dualle", phone: "+252 90 700 2050" },
    "30201": { accountingOfficer: "Director General, Public Works", financeDirector: "Director of Finance", budgetOfficer: "Nimco Cabdullaahi Axmed", phone: "+252 90 700 3020" },
    "30501": { accountingOfficer: "Director General, Energy and Water", financeDirector: "Director of Finance", budgetOfficer: "Yaasiin Cumar Bille", phone: "+252 90 700 3050" },
  };
  for (const [code, c] of Object.entries(contacts)) {
    await prisma.mda.update({
      where: { code },
      data: { accountingOfficer: c.accountingOfficer, financeDirector: c.financeDirector, budgetOfficer: c.budgetOfficer, contactPerson: c.budgetOfficer, phone: c.phone, email: `budget.${code}@budget.dev.local` },
    });
  }
  return ids;
}
