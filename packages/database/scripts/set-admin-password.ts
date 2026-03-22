import { db, users } from "../src/index.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: pnpm db:set-password <email> <password>");
  process.exit(1);
}

async function main() {
  const hashedPassword = await bcrypt.hash(password, 12);

  // Check if user exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    // Update existing user
    await db
      .update(users)
      .set({ password: hashedPassword, role: "admin" })
      .where(eq(users.email, email.toLowerCase()));
    console.log(`Updated password and role for ${email}`);
  } else {
    // Create new user
    await db.insert(users).values({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "admin",
      name: "Admin",
    });
    console.log(`Created admin user ${email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
