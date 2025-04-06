import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  AlertCircle,
  Battery,
  Zap,
  Cloud,
  Home,
  Grid,
  SunIcon,
  FileSpreadsheet,
  ListFilter,
  MoonIcon,
  AlertTriangle,
} from "lucide-react";
import axios from "axios";

const App = () => {
  // State variables
  const [file, setFile] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentData, setCurrentData] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [alertMessages, setAlertMessages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [processingSpeed, setProcessingSpeed] = useState(20000); // Default 20 seconds

  // Reference for interval timer
  const intervalRef = useRef(null);

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsProcessing(false);
      const response = await axios.post(
        "http://localhost:5000/api/uploads",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setFilePath(response.data.filePath);
      setHistoricalData([]);
      setAlertMessages([]);
      setCurrentData(null);
      setSummary(null);
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Error: ${error.response?.data?.message || error.message}
        Status: ${error.response?.status}
        Details: ${JSON.stringify(error.response?.data)}`);
    }
  };

  // Start processing data
  const startProcessing = () => {
    if (!filePath) return;

    setIsProcessing(true);

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up interval to fetch next row every X seconds
    fetchNextRow();
    intervalRef.current = setInterval(fetchNextRow, processingSpeed);
  };

  // Stop processing
  const stopProcessing = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsProcessing(false);
  };

  // Change processing speed
  const changeProcessingSpeed = (speed) => {
    setProcessingSpeed(speed);
    if (isProcessing) {
      stopProcessing();
      setTimeout(() => {
        setIsProcessing(true);
        fetchNextRow();
        intervalRef.current = setInterval(fetchNextRow, speed);
      }, 100);
    }
  };

  // Fetch next row of data
  const fetchNextRow = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/data/next?filePath=${encodeURIComponent(
          filePath
        )}`
      );

      if (response.data.done) {
        stopProcessing();
        alert("Finished processing all data rows!");
        return;
      }

      const newData = response.data.data;
      setCurrentData(newData);

      // Add to historical data
      setHistoricalData((prev) => [...prev, newData]);

      // Update alerts
      if (newData.alerts && newData.alerts.length > 0) {
        const alertArray =
          typeof newData.alerts === "string"
            ? newData.alerts.split(", ").filter((alert) => alert)
            : Array.isArray(newData.alerts)
            ? newData.alerts
            : [];

        if (alertArray.length > 0) {
          setAlertMessages((prev) => [
            ...prev,
            {
              timestamp: newData.timestamp,
              alerts: alertArray,
            },
          ]);
        }
      }

      // Fetch updated summary
      fetchSummary();
    } catch (error) {
      console.error("Error fetching data:", error);
      alert(
        "Error fetching data: " +
          (error.response?.data?.message || error.message)
      );
      stopProcessing();
    }
  };

  // Fetch summary statistics
  const fetchSummary = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/data/summary?filePath=${encodeURIComponent(
          filePath
        )}`
      );
      setSummary(response.data);
    } catch (error) {
      console.error("Error fetching summary:", error);
    }
  };

  // Download processed Excel file
  const downloadProcessedFile = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/download?filePath=${encodeURIComponent(
          filePath
        )}`,
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "processed_data.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Error downloading file:", error);
      if (error.response) {
        alert(
          `Error downloading file: ${error.response.status} - ${error.response.data}`
        );
      } else if (error.request) {
        alert("No response received from server.");
        console.error("Request details:", error.request);
      } else {
        alert(`Error setting up request: ${error.message}`);
      }
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Get color for power source badge
  const getPowerSourceColor = (source) => {
    switch (source) {
      case "Solar":
        return "bg-yellow-500";
      case "Grid":
        return "bg-blue-500";
      case "Solar+Grid":
        return "bg-green-500";
      case "Battery":
        return "bg-purple-500";
      case "Battery+Solar":
        return "bg-pink-500";
      default:
        return "bg-red-500";
    }
  };

  // Get grid status badge color
  const getGridStatusColor = (status) => {
    switch (status) {
      case "normal":
        return "bg-green-500";
      case "voltage_fluctuation":
        return "bg-yellow-500";
      case "power_off":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // Render power gauge based on current demand
  const renderPowerGauge = () => {
    if (!currentData) return null;

    const maxPower = 5000; // Assuming 5kW max for visual scale
    const percentage = Math.min(
      (currentData.household_power_demand_watts / maxPower) * 100,
      100
    );

    return (
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-1">Current Power Demand</h4>
        <div className="flex items-center">
          <Progress value={percentage} className="h-4" />
          <span className="ml-2 text-sm">
            {currentData.household_power_demand_watts}W
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Zap className="mr-2" />
            Smart Grid Energy Manager
          </CardTitle>
          <CardDescription>
            Real-time monitoring and management of smart grid energy data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="block mb-2 text-sm font-medium">
                Upload Excel Data File
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button onClick={handleUpload} disabled={!file || isProcessing}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Upload
              </Button>
              {filePath && (
                <>
                  <Button
                    onClick={startProcessing}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Start
                  </Button>
                  <Button
                    onClick={stopProcessing}
                    disabled={!isProcessing}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Stop
                  </Button>
                  <Button
                    onClick={downloadProcessedFile}
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={!summary || summary.current_row === 0}
                  >
                    Download Results
                  </Button>
                </>
              )}
            </div>
          </div>

          {filePath && (
            <div className="flex gap-2 mb-4">
              <div className="text-sm">Simulation Speed:</div>
              <Button
                size="sm"
                variant={processingSpeed === 5000 ? "default" : "outline"}
                onClick={() => changeProcessingSpeed(5000)}
                disabled={isProcessing}
              >
                Fast (5s)
              </Button>
              <Button
                size="sm"
                variant={processingSpeed === 20000 ? "default" : "outline"}
                onClick={() => changeProcessingSpeed(20000)}
                disabled={isProcessing}
              >
                Normal (20s)
              </Button>
              <Button
                size="sm"
                variant={processingSpeed === 60000 ? "default" : "outline"}
                onClick={() => changeProcessingSpeed(60000)}
                disabled={isProcessing}
              >
                Slow (60s)
              </Button>
            </div>
          )}

          {summary && (
            <div className="mb-4 text-sm">
              <p>
                Processing row {summary.current_row} of {summary.total_rows}
              </p>
              <p>
                Battery discharge cycles: {summary.battery_discharge_cycles}
              </p>
            </div>
          )}

          {currentData && (
            <div className="p-3 rounded-md bg-gray-100 mb-4">
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="text-sm font-medium">
                  Time: {currentData.timestamp}
                </span>
                <span className="text-sm font-medium flex items-center">
                  {currentData.is_daytime ? (
                    <>
                      <SunIcon className="h-4 w-4 mr-1 text-yellow-500" />{" "}
                      Daytime
                    </>
                  ) : (
                    <>
                      <MoonIcon className="h-4 w-4 mr-1 text-blue-900" />{" "}
                      Nighttime
                    </>
                  )}
                </span>
                <span className="text-sm font-medium">
                  Weather: {currentData.weather_condition}
                </span>
                <span className="text-sm font-medium">
                  Temperature: {currentData.ambient_temperature_celsius}°C
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-white text-xs ${getPowerSourceColor(
                    currentData.power_source
                  )}`}
                >
                  {currentData.power_source}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-white text-xs ${getGridStatusColor(
                    currentData.grid_status
                  )}`}
                >
                  Grid: {currentData.grid_status.replace("_", " ")}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {currentData && (
        <Tabs defaultValue="household">
          <TabsList className="grid grid-cols-6 mb-6">
            <TabsTrigger value="household">
              <Home className="mr-2 h-4 w-4" /> Household
            </TabsTrigger>
            <TabsTrigger value="battery">
              <Battery className="mr-2 h-4 w-4" /> Battery
            </TabsTrigger>
            <TabsTrigger value="solar">
              <SunIcon className="mr-2 h-4 w-4" /> Solar
            </TabsTrigger>
            <TabsTrigger value="grid">
              <Grid className="mr-2 h-4 w-4" /> Grid
            </TabsTrigger>
            <TabsTrigger value="alerts">
              <AlertTriangle className="mr-2 h-4 w-4" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="logs">
              <ListFilter className="mr-2 h-4 w-4" /> Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="household">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Household Consumption</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderPowerGauge()}

                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">
                      Current Consumption
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="p-2 bg-gray-100 rounded">
                        <div className="font-medium">Total</div>
                        <div>
                          {(currentData.total_consumption_kwh * 1000).toFixed(
                            2
                          )}{" "}
                          kWh
                        </div>
                      </div>
                      <div className="p-2 bg-yellow-100 rounded">
                        <div className="font-medium">Solar</div>
                        <div>
                          {(currentData.solar_contribution * 1000).toFixed(2)}{" "}
                          kWh
                        </div>
                      </div>
                      <div className="p-2 bg-blue-100 rounded">
                        <div className="font-medium">Grid</div>
                        <div>
                          {(currentData.grid_contribution * 1000).toFixed(2)}{" "}
                          kWh
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      Appliance Status
                    </h4>
                    <div
                      className={`p-2 rounded ${
                        currentData.heavy_appliance_active
                          ? "bg-red-100"
                          : "bg-green-100"
                      }`}
                    >
                      <span className="font-medium">Heavy Appliance: </span>
                      <span>
                        {currentData.heavy_appliance_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Consumption History</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="household_power_demand_watts"
                        name="Power Demand (W)"
                        stroke="#8884d8"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="battery">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Battery Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-1">Battery Level</h4>
                    <div className="flex items-center">
                      <Progress
                        value={currentData.battery_percent}
                        className={`h-6 ${
                          currentData.battery_percent < 20
                            ? "bg-red-100"
                            : currentData.battery_percent < 50
                            ? "bg-yellow-100"
                            : "bg-green-100"
                        }`}
                      />
                      <span className="ml-2">
                        {currentData.battery_percent}%
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div
                      className={`p-3 rounded ${
                        currentData.battery_action === "Discharging"
                          ? "bg-orange-100"
                          : currentData.battery_action === "Charging"
                          ? "bg-green-100"
                          : "bg-gray-100"
                      }`}
                    >
                      <div className="text-sm font-medium">Current Action</div>
                      <div className="text-lg">
                        {currentData.battery_action}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-100 rounded">
                      <div className="text-sm font-medium">Efficiency</div>
                      <div className="text-lg">
                        <div className="text-sm">
                          Battery Efficiency:{" "}
                          <span className="font-semibold">
                            {currentData?.battery_efficiency?.toFixed(2) ??
                              "N/A"}
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-100 rounded mb-4">
                    <div className="text-sm font-medium">
                      Estimated Backup Time
                    </div>
                    <div className="text-lg">
                      {currentData?.estimated_battery_backup_time != null
                        ? `${currentData.estimated_battery_backup_time.toFixed(
                            2
                          )} hours`
                        : "Data not available"}
                    </div>
                  </div>

                  <div className="p-3 bg-gray-100 rounded">
                    <div className="text-sm font-medium">
                      // Continue from the Battery section
                      <div className="text-sm font-medium">Health Status</div>
                      <div className="text-lg">
                        {currentData.battery_efficiency > 95
                          ? "Excellent"
                          : currentData.battery_efficiency > 85
                          ? "Good"
                          : currentData.battery_efficiency > 75
                          ? "Fair"
                          : "Poor"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Battery History</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="battery_percent"
                        name="Battery Level (%)"
                        stroke="#8884d8"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="solar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Solar Power Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-1">Current Output</h4>
                    <div className="flex items-center">
                      <Progress
                        value={(currentData.solar_input_watts / 5000) * 100}
                        className="h-4"
                      />
                      <span className="ml-2 text-sm">
                        {currentData.solar_input_watts}W
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-100 rounded">
                      <div className="text-sm font-medium">
                        Total Solar Contribution
                      </div>
                      <div className="text-lg">
                        {(
                          historicalData.reduce(
                            (sum, data) => sum + data.solar_contribution,
                            0
                          ) * 1000
                        ).toFixed(2)}{" "}
                        kWh
                      </div>
                    </div>
                    <div className="p-3 bg-gray-100 rounded">
                      <div className="text-sm font-medium">Weather Impact</div>
                      <div className="text-lg">
                        {currentData.weather_condition === "Sunny"
                          ? "Optimal"
                          : currentData.weather_condition === "Cloudy"
                          ? "Reduced"
                          : currentData.weather_condition === "Rainy"
                          ? "Minimal"
                          : "Normal"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Solar Output History</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="solar_input_watts"
                        name="Solar Output (W)"
                        stroke="#FFB347"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="grid">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Grid Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <div
                      className={`p-4 rounded-md mb-4 ${
                        currentData.grid_status === "normal"
                          ? "bg-green-100"
                          : currentData.grid_status === "voltage_fluctuation"
                          ? "bg-yellow-100"
                          : "bg-red-100"
                      }`}
                    >
                      <h3 className="text-lg font-medium mb-1">
                        Current Status:{" "}
                        {currentData.grid_status.replace("_", " ")}
                      </h3>
                      <p>
                        {currentData.grid_status === "normal"
                          ? "Grid is operating normally"
                          : currentData.grid_status === "voltage_fluctuation"
                          ? "Experiencing voltage fluctuations - using backup where needed"
                          : "Grid power unavailable - using backup systems"}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">
                      Total Grid Contribution
                    </h4>
                    <div className="p-3 bg-gray-100 rounded">
                      <div className="text-lg">
                        {(
                          historicalData.reduce(
                            (sum, data) => sum + data.grid_contribution,
                            0
                          ) * 1000
                        ).toFixed(2)}{" "}
                        kWh
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Grid Consumption History</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis
                        tickFormatter={(value) => (value * 1000).toFixed(2)}
                      />
                      <Tooltip
                        formatter={(value) => [
                          (value * 1000).toFixed(2),
                          "Grid Usage (kWh)",
                        ]}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="grid_contribution"
                        name="Grid Usage (kWh)"
                        stroke="#36A2EB"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle>System Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                {alertMessages.length > 0 ? (
                  <div className="space-y-4">
                    {alertMessages
                      .slice()
                      .reverse()
                      .map((item, index) => (
                        <Alert key={index} variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Alert at {item.timestamp}</AlertTitle>
                          <AlertDescription>
                            <ul className="list-disc pl-5 mt-2">
                              {Array.isArray(item.alerts) ? (
                                item.alerts.map((alert, i) => (
                                  <li key={i}>{alert}</li>
                                ))
                              ) : (
                                <li>{item.alerts}</li>
                              )}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      ))}
                  </div>
                ) : (
                  <p>No alerts to display.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>System Activity Log</CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Battery</th>
                      <th className="text-left p-2">Weather</th>
                      <th className="text-left p-2">Grid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData
                      .slice()
                      .reverse()
                      .map((row, index) => (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-2">{row.timestamp}</td>
                          <td className="p-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-white text-xs ${getPowerSourceColor(
                                row.power_source
                              )}`}
                            >
                              {row.power_source}
                            </span>
                          </td>
                          <td className="p-2">
                            {row.battery_percent}% ({row.battery_action})
                          </td>
                          <td className="p-2">
                            {row.weather_condition},{" "}
                            {row.ambient_temperature_celsius}°C
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-white text-xs ${getGridStatusColor(
                                row.grid_status
                              )}`}
                            >
                              {row.grid_status.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Smart Grid Energy Manager v1.0
            </div>
            <div className="text-sm text-gray-500">
              {currentData
                ? `Last Updated: ${currentData.timestamp}`
                : "No data"}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t">
          <p className="text-sm text-gray-500">
            Status: {isProcessing ? "Processing Data..." : "Ready"}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default App;
