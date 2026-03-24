import "dotenv/config";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const empPass = process.env.SEED_EMPLOYEE_PASSWORD ?? "employee123";

  const rows = [
    {
      email: "admin@example.com",
      passwordHash: await hash(adminPass, 10),
      name: "Administrator",
      role: "administrator" as const,
    },
    {
      email: "employee@example.com",
      passwordHash: await hash(empPass, 10),
      name: "Employee",
      role: "employee" as const,
    },
  ];

  for (const u of rows) {
    const [existing] = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    if (existing) {
      await db
        .update(users)
        .set({ passwordHash: u.passwordHash, role: u.role, name: u.name })
        .where(eq(users.email, u.email));
      console.log("Updated", u.email);
    } else {
      await db.insert(users).values(u);
      console.log("Created", u.email);
    }
  }

  console.log("Default passwords (change in production):");
  console.log("  admin@example.com /", adminPass);
  console.log("  employee@example.com /", empPass);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
