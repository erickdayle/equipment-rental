import fetch from "node-fetch";

class EquipmentRental {
  constructor(url, token) {
    this.url = url;
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Finds the most relevant rental record based on the current date.
   * Priority:
   * 1. Active rental that started most recently.
   * 2. Future rental that starts soonest.
   * @param {Array<Object>} recordsData - Array of record objects from the search result.
   * @returns {Object|null} The attributes of the chosen record, or null if none is suitable.
   */
  findRelevantRentalRecord(recordsData) {
    const now = new Date();
    console.log(
      "Finding relevant rental record. Current date:",
      now.toISOString()
    );

    if (!recordsData || recordsData.length === 0) {
      console.log("No rental records provided.");
      return null;
    }

    const potentialRecords = recordsData
      .map((r) => ({
        id: r.id,
        attributes: r.attributes,
        // Ensure dates are parsed, invalid dates will be handled by comparisons
        startDate: r.attributes.cf_rental_period_start
          ? new Date(r.attributes.cf_rental_period_start)
          : null,
        endDate: r.attributes.cf_rental_period_end
          ? new Date(r.attributes.cf_rental_period_end)
          : null,
      }))
      .filter(
        (r) =>
          r.startDate &&
          r.endDate &&
          r.startDate instanceof Date &&
          !isNaN(r.startDate) &&
          r.endDate instanceof Date &&
          !isNaN(r.endDate)
      ); // Filter out records with invalid or missing dates

    // Separate active and future records
    const activeRecords = potentialRecords.filter(
      (r) => r.startDate <= now && r.endDate >= now
    );
    const futureRecords = potentialRecords.filter(
      (r) => r.startDate > now && r.endDate >= now
    ); // Ensure end date is also not past for future considerations

    let chosenRecord = null;

    if (activeRecords.length > 0) {
      // If active records exist, choose the one that started most recently.
      // If multiple started at the exact same time, prefer the one ending later.
      activeRecords.sort((a, b) => {
        if (b.startDate.getTime() !== a.startDate.getTime()) {
          return b.startDate.getTime() - a.startDate.getTime(); // Most recent start date first
        }
        return b.endDate.getTime() - a.endDate.getTime(); // Then latest end date first
      });
      chosenRecord = activeRecords[0];
      console.log(
        `Selected active record: ${
          chosenRecord.id
        }, Start: ${chosenRecord.startDate.toISOString()}, End: ${chosenRecord.endDate.toISOString()}`
      );
    } else if (futureRecords.length > 0) {
      // If no active records, choose the future record that starts soonest.
      futureRecords.sort(
        (a, b) => a.startDate.getTime() - b.startDate.getTime()
      ); // Earliest start date first
      chosenRecord = futureRecords[0];
      console.log(
        `Selected future record: ${
          chosenRecord.id
        }, Start: ${chosenRecord.startDate.toISOString()}, End: ${chosenRecord.endDate.toISOString()}`
      );
    }

    if (chosenRecord) {
      console.log("Final chosen record for parent update:", chosenRecord.id);
      return chosenRecord.attributes; // Return only attributes
    } else {
      console.log("No suitable active or future rental record found.");
      return null;
    }
  }

  /**
   * Searches for child rental records of a given parent ID.
   * @param {string} parentId - The ID of the parent record.
   * @returns {Promise<Object>} The search result from the API.
   */
  async searchRentalRecords(parentId) {
    console.log(`\nSearching rental records for parentId: ${parentId}`);
    const attributesToSelect = [
      "cf_rental_period_start",
      "cf_rental_period_end",
      "cf_client_name",
      "cf_address_line1",
      "cf_address_line2",
      "cf_address_city",
      "cf_address_state",
      "cf_address_zip",
      "cf_address_country",
    ].join(", ");

    // Note: If rental child records have a specific identifier (e.g., a model_name or pkey prefix),
    // you should add it to the AQL 'where' clause for more precise filtering.
    // Example: `... where parent_id eq ${parentId} AND model_name eq 'rental_info'`
    const searchBody = JSON.stringify({
      aql: `select id, pkey, ${attributesToSelect} from __main__ where parent_id eq ${parentId}`,
    });

    console.log("Search query for rental records:", searchBody);
    const response = await fetch(`${this.url}/records/search`, {
      method: "POST",
      headers: this.headers,
      body: searchBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Search for rental records failed:`, errorText);
      throw new Error(`Search failed: ${errorText}`);
    }

    const result = await response.json();
    console.log(
      `Search results for rental records:`,
      JSON.stringify(result, null, 2)
    );
    return result;
  }

  /**
   * Updates the parent record with the provided attributes.
   * @param {string} parentId - The ID of the parent record to update.
   * @param {Object} attributesToUpdate - An object containing the attributes to update on the parent.
   * @returns {Promise<string>} The response text from the update API call.
   */
  async updateParentRecord(parentId, attributesToUpdate) {
    console.log("\nUpdating parent record with rental data:", parentId);
    console.log(
      "Update attributes:",
      JSON.stringify(attributesToUpdate, null, 2)
    );

    const updateBody = {
      data: {
        type: "records", // Assuming parent record type is 'records'
        attributes: attributesToUpdate,
      },
    };

    const response = await fetch(`${this.url}/records/${parentId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(updateBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Parent record update failed:", errorText);
      throw new Error(`Update failed: ${errorText}`);
    }

    const responseBody = await response.text(); // Read text first
    console.log(
      "Parent record updated successfully with rental data. Response:",
      responseBody
    );
    return responseBody;
  }

  /**
   * Main logic: Fetches parent, finds relevant child rental record, and updates parent.
   * @param {string} recordId - The ID of a record (e.g., a child or related record) that triggers the process.
   * The parent of this record will be targeted.
   */
  async processRentalAndUpdateParent(recordId) {
    try {
      console.log(
        "\nStarting equipment rental update process for triggering record:",
        recordId
      );

      const metaResponse = await fetch(`${this.url}/records/${recordId}/meta`, {
        headers: this.headers,
      });

      if (!metaResponse.ok) {
        const errorText = await metaResponse.text();
        console.error(
          "Failed to fetch metadata for triggering record:",
          recordId,
          errorText
        );
        throw new Error(`Metadata fetch failed for ${recordId}: ${errorText}`);
      }

      const metadata = await metaResponse.json();
      console.log(
        "Triggering record metadata:",
        JSON.stringify(metadata, null, 2)
      );

      const parentId = metadata.data?.relationships?.parent?.data?.id;

      if (!parentId) {
        console.log(
          "No parent ID found for triggering record, skipping update."
        );
        return;
      }
      console.log("Found parent ID:", parentId);

      const rentalRecordsResult = await this.searchRentalRecords(parentId);

      if (!rentalRecordsResult.data || rentalRecordsResult.data.length === 0) {
        console.log("No child rental records found for parent:", parentId);
        // Consider if parent fields should be cleared if no relevant child is found.
        // Current logic: no update if no relevant child.
        return;
      }

      const relevantRentalAttributes = this.findRelevantRentalRecord(
        rentalRecordsResult.data
      );

      if (relevantRentalAttributes) {
        const attributesForParent = {
          cf_rental_period_start:
            relevantRentalAttributes.cf_rental_period_start,
          cf_rental_period_end: relevantRentalAttributes.cf_rental_period_end,
          cf_client_name: relevantRentalAttributes.cf_client_name,
          cf_address_line1: relevantRentalAttributes.cf_address_line1,
          cf_address_line2: relevantRentalAttributes.cf_address_line2,
          cf_address_city: relevantRentalAttributes.cf_address_city,
          cf_address_state: relevantRentalAttributes.cf_address_state,
          cf_address_zip: relevantRentalAttributes.cf_address_zip,
          cf_address_country: relevantRentalAttributes.cf_address_country,
        };

        // Filter out any keys that might have undefined values from the child
        const filteredAttributesForParent = Object.entries(attributesForParent)
          .filter(([_, value]) => value !== undefined)
          .reduce((obj, [key, value]) => {
            obj[key] = value; // This will keep null values if they are present
            return obj;
          }, {});

        if (Object.keys(filteredAttributesForParent).length > 0) {
          console.log(
            "\nFinal attributes for parent update:",
            JSON.stringify(filteredAttributesForParent, null, 2)
          );
          await this.updateParentRecord(parentId, filteredAttributesForParent);
          console.log(
            "Parent record update with rental data completed successfully."
          );
        } else {
          console.log(
            "No attributes derived from relevant rental record to update parent (all were undefined)."
          );
        }
      } else {
        console.log(
          "No relevant (active or upcoming) rental record found to update the parent."
        );
        // If you need to clear the parent fields when no relevant child is found,
        // you would call `updateParentRecord` here with null/empty values for the fields.
        // Example:
        // const clearAttributes = { cf_rental_period_start: null, cf_client_name: null, ... };
        // await this.updateParentRecord(parentId, clearAttributes);
      }
    } catch (error) {
      console.error(
        "Error in processing rental and updating parent:",
        error.message
      );
      // Log stack for more details if in a debugging environment
      // console.error(error.stack);
      throw error;
    }
  }
}

export default EquipmentRental;
