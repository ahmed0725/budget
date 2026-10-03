/**
 * Database integrity triggers (MySQL 8 / MariaDB 10.4+).
 *
 * - audit_logs, approval_steps and budget_versions are append-only.
 * - Form data of approved (locked) submissions cannot change.
 * - Approved submissions cannot be unlocked, edited or deleted; only publication and
 *   supersession may be recorded.
 *
 * Maintenance bypass: a database administrator (or the test harness) may run
 *   SET @gbms_maintenance = 1;
 * in a session to perform controlled maintenance. The application never sets it.
 *
 * Applied idempotently by scripts/db-deploy.mjs (and the integration-test setup).
 * Messages are matched by src/lib/errors.ts — keep the wording.
 */

const bypass = "COALESCE(@gbms_maintenance, 0) <> 1";
const signal = (message) => `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${message.replace(/'/g, "''")}'`;

const APPEND_ONLY = ["audit_logs", "approval_steps", "budget_versions"];
const LOCKED_CHILDREN = ["budget_lines", "personnel_budgets", "procurement_plans", "cash_flow_forecasts", "submission_notes", "certifications"];

/** Columns of an approved submission that may not change. */
const FROZEN = ["budgetYearId", "mdaId", "revisionNumber", "allocationNumber", "agencyCategory", "accountingOfficer", "contactPerson", "telephone", "email", "totalRevenue", "totalExpenditure", "totalRecurrent", "totalPersonnel", "totalCapital", "approvedAt", "approvedById"];

function trigger(name, timing, table, body) {
  return [`DROP TRIGGER IF EXISTS \`${name}\``, `CREATE TRIGGER \`${name}\` ${timing} ON \`${table}\` FOR EACH ROW\nBEGIN\n${body}\nEND`];
}

export function integrityStatements() {
  const out = [];
  for (const t of APPEND_ONLY) {
    for (const op of ["UPDATE", "DELETE"]) {
      out.push(...trigger(`${t}_append_only_${op.toLowerCase()}`, `BEFORE ${op}`, t, `  IF ${bypass} THEN\n    ${signal(`Table ${t} is append-only: ${op} is not permitted`)};\n  END IF;`));
    }
  }
  const locked = (ref) => `EXISTS (SELECT 1 FROM \`budget_submissions\` WHERE \`id\` = ${ref}.\`submissionId\` AND \`isLocked\` = 1)`;
  for (const t of LOCKED_CHILDREN) {
    const msg = (op) => signal(`Budget submission is approved and locked; ${op} on ${t} is not permitted`);
    out.push(...trigger(`${t}_locked_insert`, "BEFORE INSERT", t, `  IF ${bypass} AND ${locked("NEW")} THEN\n    ${msg("INSERT")};\n  END IF;`));
    out.push(...trigger(`${t}_locked_update`, "BEFORE UPDATE", t, `  IF ${bypass} AND (${locked("OLD")} OR ${locked("NEW")}) THEN\n    ${msg("UPDATE")};\n  END IF;`));
    out.push(...trigger(`${t}_locked_delete`, "BEFORE DELETE", t, `  IF ${bypass} AND ${locked("OLD")} THEN\n    ${msg("DELETE")};\n  END IF;`));
  }
  const changed = FROZEN.map((c) => `NOT (NEW.\`${c}\` <=> OLD.\`${c}\`)`).join("\n       OR ");
  out.push(
    ...trigger(
      "budget_submissions_protect_update",
      "BEFORE UPDATE",
      "budget_submissions",
      `  IF ${bypass} AND OLD.\`isLocked\` = 1 THEN
    IF NEW.\`isLocked\` = 0 THEN
      ${signal("Approved budget submission cannot be unlocked; create a revision instead")};
    END IF;
    IF NEW.\`status\` NOT IN ('APPROVED', 'PUBLISHED')
       OR ${changed} THEN
      ${signal("Approved budget submission is immutable; only publication and supersession may be recorded")};
    END IF;
  END IF;`,
    ),
  );
  out.push(
    ...trigger(
      "budget_submissions_protect_delete",
      "BEFORE DELETE",
      "budget_submissions",
      `  IF ${bypass} AND (OLD.\`isLocked\` = 1 OR OLD.\`status\` IN ('APPROVED', 'PUBLISHED')) THEN
    ${signal("Approved budget submission cannot be deleted")};
  END IF;`,
    ),
  );
  return out;
}

/**
 * Apply the triggers through a mariadb/mysql connection (`conn.query`).
 * Returns { applied, error } — triggers are defence in depth (the application enforces
 * the same rules), so a host that does not allow CREATE TRIGGER only gets a warning.
 */
export async function applyIntegrity(conn) {
  const statements = integrityStatements();
  try {
    for (const sql of statements) await conn.query(sql);
    return { applied: statements.filter((s) => s.startsWith("CREATE")).length, error: null };
  } catch (e) {
    return { applied: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
