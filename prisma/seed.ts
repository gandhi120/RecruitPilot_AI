// prisma/seed.ts — default Settings rows; idempotent (upsert, never clobber edits)
// Doc 11 §5.8: the assistant's configurable surface must exist before the first
// call. `update: {}` means re-running NEVER overwrites Varun's dashboard edits.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GREETING =
  "Hello. You've reached Varun Gandhi's AI Assistant. Varun is currently unavailable. " +
  "With your permission, I can collect information regarding this opportunity and immediately notify him.";

const PREDEFINED_QUESTIONS = [
  { id: "company", text: "Which company is this opportunity with?" },
  { id: "role", text: "What is the role title and its seniority level?" },
  { id: "tech_stack", text: "What is the primary tech stack for the role?" },
  { id: "compensation", text: "What is the compensation range?" },
  { id: "location", text: "Where is the role based, and what is the remote policy?" },
  { id: "urgency", text: "How urgent is the hiring timeline?" },
  { id: "next_steps", text: "What are the next steps in the process?" },
];

async function main() {
  const defaults: Array<{ key: string; value: object }> = [
    { key: "greeting_text", value: { text: GREETING } },
    { key: "predefined_questions", value: { questions: PREDEFINED_QUESTIONS } },
    { key: "feature_flags", value: { askCompensation: true, sendResumeEnabled: true } },
  ];
  for (const s of defaults) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {}, // exists → leave Varun's dashboard edits alone
      create: { key: s.key, value: s.value },
    });
  }

  // One test recruiter (roadmap M1.1): powers the identify-webhook dev loop
  // (doc 17 §7) and the Phase-3 "agent greets you by name" verification.
  // Uses an obviously-fake reserved-style number; replace with your real
  // number in YOUR local DB (not in this file) to test live recognition.
  await prisma.recruiter.upsert({
    where: { phone: "+919876543210" },
    update: {},
    create: {
      phone: "+919876543210",
      name: "Priya Sharma",
      company: "TechCorp",
      email: "priya@techcorp.example",
      notes: "Seed test recruiter (doc 17 fixtures)",
      memories: {
        create: [
          {
            kind: "history",
            content:
              "Spoke previously about a Senior React Native role in Bengaluru; Varun asked for the JD.",
          },
        ],
      },
    },
  });

  console.log(`Seeded ${defaults.length} settings + 1 test recruiter.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
