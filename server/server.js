const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Configuration
const BATTERY_CAPACITY_KWH = 10; // 10 kWh battery capacity
let currentRowIndex = 0;
let batteryDischargeCycles = 0;
let lastBatteryAction = null;

// Load Excel file and process data
function loadExcelData(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(data);
    return data;
  } catch (error) {
    console.error("Error loading Excel file:", error);
    return [];
  }
}

// Process raw data according to updated logic
function processRowData(rowData) {
  // Extract raw data
  const {
    timestamp,
    is_daytime,
    solar_input_watts,
    grid_status,
    household_power_demand_watts,
    heavy_appliance_active,
    ambient_temperature_celsius,
    weather_condition,
    battery_percent,
  } = rowData;

  // Initialize alerts array
  const alerts = [];

  // 1. Determine power_source based on updated logic
  let power_source;

  console.log("Processing power_source:", {
    is_daytime,
    grid_status,
    solar_input_watts,
    household_power_demand_watts,
  });

  if (is_daytime) {
    // Daytime logic
    if (grid_status === "normal") {
      if (solar_input_watts >= household_power_demand_watts) {
        power_source = "Solar";
      } else {
        power_source = "Solar+Grid";
      }
    } else if (
      grid_status === "power off" ||
      grid_status === "voltage fluctuation"
    ) {
      if (solar_input_watts >= household_power_demand_watts) {
        power_source = "Solar";
        alerts.push("Grid power unavailable. Using solar only.");
      } else {
        power_source = "Solar+Battery";
        alerts.push("Powering from battery due to grid issue.");
      }
      if (heavy_appliance_active) {
        alerts.push("Warning: Heavy appliances running on solar backup.");
      }
    }
  } else {
    // Nighttime logic
    if (grid_status === "normal") {
      power_source = "Grid";
    } else if (
      grid_status === "power off" ||
      grid_status === "voltage fluctuation"
    ) {
      power_source = "Battery";
      alerts.push("Switched to battery.");

      if (heavy_appliance_active) {
        alerts.push(
          "Warning: Heavy appliances on battery backup. Consider turning off."
        );
      }
    } else if (grid_status === "power off") {
      power_source = "Battery";
      alerts.push("Grid power unavailable. Using battery backup.");

      if (heavy_appliance_active) {
        alerts.push(
          "Warning: High load on battery backup. Turn off heavy devices."
        );
      }
    }
  }

  console.log("Calculated power source:", power_source);

  let parsedBatteryPercent = null;
  if (typeof battery_percent === "string") {
    try {
      parsedBatteryPercent = parseFloat(battery_percent);
      if (parsedBatteryPercent < 1) {
        parsedBatteryPercent *= 100; // Convert to percentage if it's a fraction
        battery_percent = parsedBatteryPercent;
      }
    } catch (e) {
      console.error("Error parsing battery_percent:", battery_percent, e);
    }
  } else if (typeof battery_percent === "number") {
    parsedBatteryPercent = battery_percent;
  }

  // Check for additional battery-related alerts
  if (battery_percent < 28) {
    alerts.push("Battery Low: " + battery_percent + "%");
  }

  // 2. Determine battery_action
  let battery_action;

  // First, check if the battery is being used as a power source
  if (power_source === "Battery" || power_source === "Solar+Battery") {
    battery_action = "Discharging";

    // Update discharge cycles if switching from non-discharging to discharging
    if (lastBatteryAction !== "Discharging") {
      batteryDischargeCycles++;
    }
  }
  // Next, check if we can charge from solar
  else if (
    is_daytime &&
    solar_input_watts > household_power_demand_watts &&
    battery_percent < 100
  ) {
    battery_action = "Charging";
  }
  // If grid is normal and battery isn't full, charge it
  else if (grid_status === "normal" && battery_percent < 100) {
    battery_action = "Charging";
  }
  // During power issues, use battery if it has enough charge
  else if (
    (grid_status === "power off" || grid_status === "voltage fluctuation") &&
    battery_percent > 28
  ) {
    // This condition might never be reached due to the first condition already catching cases
    // where power_source is Battery or Solar+Battery
    battery_action = "Discharging";
  }
  // If none of the above, set to Idle
  else {
    battery_action = "Idle";
  }


  // Update last battery action for next cycle
  lastBatteryAction = battery_action;

  // 3. Calculate currentData.battery_efficiency
  const battery_efficiency = 100 - batteryDischargeCycles * 0.2;

  // 4. Calculate source_unit_contribution (kWh per 20 seconds)
  // Convert watts to kWh for 20 seconds: watts * (20/3600) / 1000
  const hourFraction = 20 / 3600; // 20 seconds as fraction of hour
  const totalDemandKwh = (household_power_demand_watts * hourFraction) / 1000;

  let solar_contribution = 0;
  let grid_contribution = 0;
  let battery_contribution = 0;

  switch (power_source) {
    case "Solar":
      solar_contribution = totalDemandKwh;
      break;
    case "Grid":
      grid_contribution = totalDemandKwh;
      break;
    case "Solar+Grid":
      solar_contribution = (solar_input_watts * hourFraction) / 1000;
      grid_contribution = totalDemandKwh - solar_contribution;
      break;
    case "Solar+Battery":
      solar_contribution = (solar_input_watts * hourFraction) / 1000;
      battery_contribution = totalDemandKwh - solar_contribution;
      break;
    case "Battery":
      battery_contribution = totalDemandKwh;
      break;
  }

  // 5. Calculate estimated_battery_backup_time (in hours)
  const current_load_kW = household_power_demand_watts / 1000;
  let estimated_battery_backup_time = 0;

  if (current_load_kW > 0) {
    estimated_battery_backup_time =
      ((battery_percent / 100) * BATTERY_CAPACITY_KWH) / current_load_kW;
  }

  // Compile processed data
  const processedData = {
    ...rowData,
    power_source,
    battery_action,
    battery_efficiency,
    solar_contribution,
    grid_contribution,
    battery_contribution,
    total_consumption_kwh: totalDemandKwh,
    estimated_battery_backup_time,
    alerts: alerts.join(", "),
    discharge_cycles: batteryDischargeCycles,
  };

  return processedData;
}

// Write processed data back to Excel file
function appendProcessedData(filePath, processedData) {
  try {
    // Read existing workbook
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get current data
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Find corresponding row and update with processed data
    const updatedData = data.map((row, index) => {
      if (index === currentRowIndex - 1) {
        return { ...row, ...processedData };
      }
      return row;
    });

    // Write back to worksheet
    const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
    workbook.Sheets[sheetName] = newWorksheet;

    // Write to file
    XLSX.writeFile(workbook, filePath);
    console.log(`Row ${currentRowIndex} updated with processed data`);
  } catch (error) {
    console.error("Error updating Excel file:", error);
  }
}

// API endpoints
app.post("/api/uploads", (req, res) => {
  console.log("Received upload request");
  console.log("Files:", req.files);
  console.log("Body:", req.body);

  if (!req.files || !req.files.file) {
    console.log("No file detected in the request");
    return res.status(400).send("No file uploaded");
  }

  const file = req.files.file;
  const uploadPath = path.join(__dirname, "uploads", file.name);

  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(path.join(__dirname, "uploads"))) {
    fs.mkdirSync(path.join(__dirname, "uploads"));
  }

  // Move uploaded file
  file.mv(uploadPath, (err) => {
    if (err) {
      return res.status(500).send(err);
    }

    // Reset counters
    currentRowIndex = 0;
    batteryDischargeCycles = 0;

    res.json({
      message: "File uploaded successfully",
      filePath: uploadPath,
    });
  });
});

app.get("/api/data/next", (req, res) => {
  const filePath = req.query.filePath;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const data = loadExcelData(filePath);

  // Check if we've reached the end of data
  if (currentRowIndex >= data.length) {
    return res.json({ done: true });
  }

  // Get and process next row
  const rawRow = data[currentRowIndex];
  const processedRow = processRowData(rawRow);

  // Append processed data back to Excel
  appendProcessedData(filePath, processedRow);

  // Increment row index for next call
  currentRowIndex++;

  res.json({
    done: false,
    data: processedRow,
  });
});

// Download endpoint
app.get("/api/download", (req, res) => {
  const filePath = decodeURIComponent(req.query.filePath);

  console.log("Decoded file path:", filePath);

  if (!filePath || !fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    return res.status(404).send("File not found");
  }

  // Use res.download for proper handling of file downloads
  res.download(filePath, "processed_data.xlsx", (err) => {
    if (err) {
      console.error("Error downloading file:", err);
      res.status(500).send("Error downloading file");
    }
  });
});

app.get("/api/data/summary", (req, res) => {
  const filePath = req.query.filePath;

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const data = loadExcelData(filePath);

  // Calculate summary statistics from processed data
  const summary = {
    total_rows: data.length,
    current_row: Math.min(currentRowIndex, data.length),
    battery_discharge_cycles: batteryDischargeCycles,
    // Add more summary stats as needed
  };

  res.json(summary);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
