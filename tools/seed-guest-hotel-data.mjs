import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const rootDir = process.cwd();
const defaultHotelId = process.env.GUEST_HOTEL_ID?.trim() || "7Bg2xD9pcRmXOllPu2US";
const hotelId = process.argv[2]?.trim() || defaultHotelId;

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return {
      projectId: parsed.projectId ?? parsed.project_id ?? "",
      clientEmail: parsed.clientEmail ?? parsed.client_email ?? "",
      privateKey: parsed.privateKey ?? parsed.private_key ?? "",
    };
  }

  if (
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const serviceAccount = getServiceAccount();

  if (!serviceAccount) {
    throw new Error(
      "FIREBASE admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_* env vars.",
    );
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  const db = getFirestore();
  const dataDir = path.join(rootDir, "data", "guest", "hotels", hotelId);
  const hearingSheet = await readJsonFile(path.join(dataDir, "hearing_sheet.json"));
  const guestRichMenu = await readJsonFile(path.join(dataDir, "guest_rich_menu.json"));

  await db.collection("hearing_sheets").doc(hotelId).set(hearingSheet, { merge: true });
  await db.collection("guest_rich_menus").doc(hotelId).set(guestRichMenu, { merge: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        hotelId,
        hearingSheetPath: `hearing_sheets/${hotelId}`,
        richMenuPath: `guest_rich_menus/${hotelId}`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[guest/seed] failed", {
    hotelId,
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
