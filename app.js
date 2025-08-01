import "dotenv/config";
import EquipmentRental from "./equipment_rental.js";

async function main() {
  const recordId = process.argv[2];
  const projectId = process.argv[3];

  if (!recordId) {
    console.error("Error: recordId is a required argument.");
    process.exit(1);
  }

  try {
    // Correctly use the environment variables loaded by 'dotenv/config'
    const equipmentRental = new EquipmentRental(
      process.env.url,
      process.env.token
    );

    await equipmentRental.processRecordUpdate(recordId);
  } catch (error) {
    // The EquipmentRental class constructor now throws specific errors
    // which will be caught and logged here.
    console.error("Error during script execution:", error.message);
    process.exit(1);
  }
}

main();
