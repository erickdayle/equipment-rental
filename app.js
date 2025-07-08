import "dotenv/config";
import EquipmentRental from "./equipment_rental.js";

async function main() {
  const recordId = process.argv[2];
  const projectId = process.argv[3];

  if (!recordId) {
    console.error("Error: recordId is a required argument.");
    process.exit(1);
  }

  // todo: remove env variables, temporarily used for testing
  try {
    const equipmentRental = new EquipmentRental(
      "https://metrology-sandbox.pscace.com/gateway/v2",
      "ftmCqFCCHJRmkbZjCVwgHA2pnC2SkiqJ||I1biGemHnUAbrUyoSohobGoe2ByKiYaq"
    );

    await equipmentRental.processRecordUpdate(recordId);
  } catch (error) {
    console.error("The script encountered an unrecoverable error.");
    process.exit(1);
  }
}

main();
