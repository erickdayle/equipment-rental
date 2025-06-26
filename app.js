import "dotenv/config";
import EquipmentRental from "./equipment_rental.js";

async function main() {
  const recordId = process.argv[2];
  // projectId is captured but not used in the new logic, which is fine.
  const projectId = process.argv[3];

  if (!recordId) {
    console.error("Error: recordId is a required argument.");
    process.exit(1);
  }

  try {
    const equipmentRental = new EquipmentRental(
      process.env.url,
      process.env.token
    );
    // Call the new main method in the EquipmentRental class
    await equipmentRental.processRecordUpdate(recordId);
  } catch (error) {
    // The error is already logged in the EquipmentRental class,
    // but we can log a final message here.
    console.error("The script encountered an unrecoverable error.");
    process.exit(1);
  }
}

main();
