import fetch from "node-fetch";

class EquipmentRental {
  constructor(url, token) {
    const cleanUrl = url ? url.trim() : undefined;

    if (!cleanUrl) {
      throw new Error(
        "The API URL is missing. Please ensure the 'url' environment variable is set correctly in your cloud environment."
      );
    }
    if (!cleanUrl.startsWith("http")) {
      throw new Error(
        `The provided API URL "${cleanUrl}" is invalid. It must start with http:// or https://.`
      );
    }

    this.url = cleanUrl;
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // --- PRIVATE HELPER METHODS ---

  async _getRecordData(recordId) {
    console.log(`Fetching full data for record: ${recordId}`);
    const response = await fetch(`${this.url}/records/${recordId}/meta`, {
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch record data for ${recordId}:`, errorText);
      return null;
    }

    const responseBodyText = await response.text();
    console.log("Raw API response body:", responseBodyText);
    try {
      const result = JSON.parse(responseBodyText);
      if (result.data && result.data.attributes) {
        console.log(
          "Parsed attributes from API:",
          JSON.stringify(result.data.attributes, null, 2)
        );
      }
      return result.data;
    } catch (e) {
      console.error("Failed to parse JSON from API response:", e);
      return null;
    }
  }

  async _getWorkflowStep(stepId) {
    console.log(`Fetching workflow step details for ID: ${stepId}`);
    const response = await fetch(`${this.url}/workflow-steps/${stepId}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch workflow step ${stepId}:`, errorText);
      return null;
    }
    const result = await response.json();
    return result.data;
  }

  async _getRecordTypeName(typeId) {
    console.log(`Searching for record type name with ID: ${typeId}`);
    const searchBody = JSON.stringify({
      aql: `select id, name from __main__ where id eq ${typeId}`,
    });

    const response = await fetch(`${this.url}/record-types/search`, {
      method: "POST",
      headers: this.headers,
      body: searchBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Record type search failed for ID ${typeId}:`, errorText);
      return null;
    }

    const result = await response.json();
    if (result.data && result.data.length > 0) {
      const typeName = result.data[0].attributes.name;
      console.log(`Found record type name: "${typeName}"`);
      return typeName;
    }

    console.error(`Record type with ID ${typeId} not found.`);
    return null;
  }

  async _updateRecord(recordId, attributesToUpdate) {
    console.log(`\nUpdating record: ${recordId}`);
    console.log(
      "Update attributes:",
      JSON.stringify(attributesToUpdate, null, 2)
    );

    const updateBody = {
      data: {
        type: "records",
        id: recordId,
        attributes: attributesToUpdate,
      },
    };

    const response = await fetch(`${this.url}/records/${recordId}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(updateBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Record update for ${recordId} failed:`, errorText);
      throw new Error(`Update failed: ${errorText}`);
    }

    console.log(`Record ${recordId} updated successfully.`);
  }

  // --- LOGIC HANDLERS ---

  async _handleOnHold(recordData) {
    console.log("Handling 'Equipment On Hold' status.");
    const equipmentListJson = recordData.attributes?.cf_list_equipment_to_be;
    if (!equipmentListJson) {
      console.log("No equipment list found. Nothing to calculate.");
      return;
    }

    let equipmentList;
    try {
      equipmentList = JSON.parse(equipmentListJson);
    } catch (error) {
      console.error("Failed to parse equipment list JSON:", error);
      return;
    }

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    for (const item of equipmentList) {
      const values = item.values;
      const startDate = new Date(values.cf_rental_period_start);
      const endDate = new Date(values.cf_rental_period_end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

      const durationDays = Math.round((endDate - startDate) / MS_PER_DAY) + 1;
      if (durationDays <= 0) continue;

      const quantity = parseFloat(values.cf_quantity_rental) || 0;
      const dailyRate = parseFloat(values.cf_daily_rental_price) || 0;
      const weeklyRate = parseFloat(values.cf_weekly_rental_price) || 0;
      const monthlyRate = parseFloat(values.cf_monthly_rental_price) || 0;

      let totalCost = 0;
      if (monthlyRate > 0 && durationDays >= 28) {
        totalCost = (durationDays / 30) * monthlyRate * quantity;
      } else if (weeklyRate > 0 && durationDays >= 7) {
        totalCost = (durationDays / 7) * weeklyRate * quantity;
      } else if (dailyRate > 0) {
        totalCost = durationDays * dailyRate * quantity;
      }
      values.cf_total_cost = totalCost.toFixed(2);
    }

    const updatedEquipmentListJson = JSON.stringify(equipmentList);
    await this._updateRecord(recordData.id, {
      cf_list_equipment_to_be: updatedEquipmentListJson,
    });
    console.log("Successfully calculated and updated line item costs.");
  }

  async _handleShipmentPreparation(recordData) {
    console.log("Handling 'Shipment Preparation' status.");
    const equipmentListJson = recordData.attributes?.cf_list_equipment_to_be;
    if (!equipmentListJson) {
      console.log("No equipment list found. Cannot process for shipment.");
      return;
    }

    let equipmentList;
    try {
      equipmentList = JSON.parse(equipmentListJson);
    } catch (error) {
      console.error("Failed to parse equipment list JSON:", error);
      return;
    }

    const overallTotalCost = equipmentList.reduce((sum, item) => {
      return sum + (parseFloat(item.values.cf_total_cost) || 0);
    }, 0);

    console.log(
      `Calculated Overall Total Cost: ${overallTotalCost.toFixed(2)}`
    );

    await this._updateRecord(recordData.id, {
      cf_total_equipment_rental_cost: overallTotalCost.toFixed(2),
    });

    const assetIds = recordData.attributes?.cf_available_equipment;
    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      console.log("No associated assets found in 'cf_available_equipment'.");
      return;
    }

    const rentalAttributes = recordData.attributes;
    const updatePayload = {
      cf_rental_period_start: rentalAttributes.cf_rental_period_start,
      cf_rental_period_end: rentalAttributes.cf_rental_period_end,
      cf_client_name: rentalAttributes.cf_client_project_name,
      cf_equipment_rental_record: recordData.id,
      cf_address_line1: rentalAttributes.cf_address_line1,
      cf_address_line2: rentalAttributes.cf_address_line2,
      cf_address_city: rentalAttributes.cf_address_city,
      cf_address_state: rentalAttributes.cf_address_state,
      cf_address_zip: rentalAttributes.cf_address_zip,
      cf_address_country: rentalAttributes.cf_address_country,
    };

    console.log(`Updating ${assetIds.length} associated asset(s)...`);
    for (const assetId of assetIds) {
      await this._updateRecord(assetId, updatePayload);
    }
    console.log("Finished updating associated assets.");
  }

  async _handleAssetComponentUpdate(recordId) {
    console.log(
      "Handling Asset/Component record update. Clearing rental fields."
    );
    const clearPayload = {
      cf_rental_period_start: null,
      cf_rental_period_end: null,
      cf_client_name: null,
      cf_equipment_rental_record: null,
      cf_address_line1: null,
      cf_address_line2: null,
      cf_address_city: null,
      cf_address_state: null,
      cf_address_zip: null,
      cf_address_country: null,
    };
    await this._updateRecord(recordId, clearPayload);
    console.log(`Cleared rental fields for record ${recordId}.`);
  }

  // --- PUBLIC MAIN METHOD ---

  async processRecordUpdate(recordId) {
    try {
      console.log(`\nStarting record processing for ID: ${recordId}`);

      const recordData = await this._getRecordData(recordId);
      if (!recordData) return;

      const typeId = recordData.relationships?.type?.data?.id;
      if (!typeId) {
        console.log("Record is missing type ID. Aborting.");
        return;
      }

      const recordTypeName = await this._getRecordTypeName(typeId);
      if (!recordTypeName) return;

      if (
        recordTypeName === "Asset Record" ||
        recordTypeName === "Component Record"
      ) {
        await this._handleAssetComponentUpdate(recordId);
        return;
      }

      if (recordTypeName === "Equipment Rental") {
        const pkey = recordData.attributes?.pkey;
        const statusId = recordData.relationships?.status?.data?.id;

        if (!pkey || !statusId) {
          console.log(
            "Equipment Rental record is missing pkey or status ID. Aborting."
          );
          return;
        }

        const workflowStep = await this._getWorkflowStep(statusId);
        const workflowStepText = workflowStep?.attributes?.text;
        console.log(
          `Record pkey: "${pkey}", Workflow Step: "${workflowStepText}"`
        );

        if (!pkey.includes("RENT")) {
          console.log("Pkey does not contain 'RENT'. No action taken.");
          return;
        }

        switch (workflowStepText) {
          case "Equipment On Hold":
            await this._handleOnHold(recordData);
            break;
          case "Shipment Preparation":
            await this._handleShipmentPreparation(recordData);
            break;
          default:
            console.log(
              `No action defined for workflow step: "${workflowStepText}".`
            );
            break;
        }
        return;
      }

      console.log(`No logic defined for record type: "${recordTypeName}".`);
    } catch (error) {
      console.error("Error during main record processing:", error.message);
      throw error;
    }
  }
}

export default EquipmentRental;
