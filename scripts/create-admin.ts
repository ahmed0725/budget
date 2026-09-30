/**
 * Create a system administrator account (first installation or recovery).
 *
 *   npm run create-admin -- --username jdoe --email jdoe@example.gov --name "Jane Doe"
 *
 * A temporary password is generated and printed once; the user must change it at the
 * first sign-in. The account receives the SYSTEM_ADMIN role created by the seed.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { hashPassword } from "../src/lib/auth/password";
import { prisma } from "../src/lib/db";
import { temporaryPassword } from "../src/lib/services/admin";

async function main() {
  const { values } = parseArgs({ options: { username: { type: "string" }, email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "SYSTEM_ADMIN" } } });
  const username = values.username?.trim().toLowerCase();
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!username || !email || !name || !/^[a-z0-9._-]{3,50}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('Usage: npm run create-admin -- --username <3-50 letters/digits/._-> --email <e-mail> --name "<full name>"');
    process.exitCode = 1;
    return;
  }
  const role = await prisma.role.findUnique({ where: { key: values.role! } });
  if (!role) {
    console.error(`Role ${values.role} does not exist. Run the seed (SEED_SKIP_DEV=true npm run db:seed) first.`);
    process.exitCode = 1;
    return;
  }
  if (await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } })) {
    console.error("A user with this username or e-mail already exists.");
    process.exitCode = 1;
    return;
  }
  const password = temporaryPassword();
  const user = await prisma.user.create({
    data: { username, email, fullName: name, passwordHash: await hashPassword(password), mustChangePassword: true, roles: { create: { roleId: role.id } } },
  });
  await prisma.auditLog.create({ data: { userName: "System (create-admin)", action: "CREATE", entityType: "User", entityId: user.id, summary: `Created administrator ${username} from the command line` } });
  console.log(`Created ${username} with role ${role.key}.`);
  console.log(`Temporary password (shown once, must be changed at first sign-in): ${password}`);
}

main().finally(() => prisma.$disconnect());
