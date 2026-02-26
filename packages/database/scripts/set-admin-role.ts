/**
 * Set a user's role to admin.
 * Usage: pnpm tsx scripts/set-admin-role.ts [email]
 * Example: pnpm tsx scripts/set-admin-role.ts ariel@relmedia.no
 */
import { db, users } from "../src";
import { eq } from "drizzle-orm";

const email = process.argv[2] ?? "ariel@relmedia.no";

async function setAdminRole() {
  const result = await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email, role: users.role });

  if (result.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Updated ${result[0].email} to role: admin`);
}

setAdminRole().catch((err) => {
  console.error(err);
  process.exit(1);
});
