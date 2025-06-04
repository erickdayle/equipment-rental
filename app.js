// In your app.js or similar main script:
import "dotenv/config";
import EquipmentRental from "./equipment_rental.js"; // Ensure this path is correct

async function main() {
  const recordId = process.argv[2]; // This is the ID of the record triggering the process
  // const projectId = process.argv[3]; // projectId is still available but not used by EquipmentRental

  try {
    const equipmentRental = new EquipmentRental(
      process.env.url,
      process.env.token
    );
    await equipmentRental.processRentalAndUpdateParent(recordId); // Call the new method
  } catch (error) {
    // Error is already logged in EquipmentRental, but you can add more handling here
    console.error("Main process error:", error.message);
    process.exit(1);
  }
}

main();
