/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fetch = require('node-fetch');
const handleMessage = require('./lib/engine');
const df = require("durable-functions");

const msiEndpoint = process.env.MSI_ENDPOINT;
const msiSecret = process.env.MSI_SECRET;

const parameters = {
    idScope: process.env.ID_SCOPE,
    primaryKeyUrl: process.env.IOTC_KEY_URL
};
let kvToken;


module.exports = async function (context, IoTHubMessages) {
    context.log(`JavaScript eventhub trigger function called for message array: ${JSON.stringify(IoTHubMessages)}`);

    // Get current values from entity function
    const client = df.getClient(context);
    const entityId = new df.EntityId("Entity", "myTelemetry");
    const stateResponse = await client.readEntityState(entityId);
    let curState = stateResponse.entityState ?? {};
    let prevValues = {};

    //Entity clear function
    if (IoTHubMessages == "Clear entity") { client.signalEntity(entityId, "clear"); return; }

    let req = { device: {}, measurements: {} };
    let contModel = "";
    let exportData = false;

    let val = typeof (IoTHubMessages) == "string" ? JSON.parse(IoTHubMessages) : IoTHubMessages;

    val.forEach((curTel, index) => {
        //Check for first run
        if (!Object.keys(req.device).includes("deviceId") && !Object.keys(req.device).includes("modelId")) {
            //Assign variables
            req.device.deviceId = curTel.deviceId;
            req.device.modelId = curTel.modelId;
            contModel = curTel.model;
            if (curState[contModel]) {
                if (curState[contModel][req.device.deviceId]) {
                    prevValues = curState[contModel][req.device.deviceId];
                    context.log("[Entity values assigned to prevValues] " + JSON.stringify(prevValues));
                }
                else {
                    client.signalEntity(entityId, "addDevice", contModel + "~" + req.device.deviceId);
                    prevValues = { "AlarmCount": 0, "EngineSpeed": 0, "ControlMode": -1, "ControlModeAuto": 0, "ControlModeTest": 0, "ControlModeManual": 0, "ControlModeStop": 0, "MainL1Voltage": 0, "EngineRunTime": 0, "NumberOfStarts": 0, "ChargeAltFailure": 0, "FailToStop": 0, "LowFuelLevel": 0, "HighCoolantTemp": 0, "GenHighCurrent": 0, "GenOverFreq": 0, "HighTempSwitch": 0, "GenHighVoltage": 0, "BatteryLowVoltage": 0, "GenUnderFreq": 0, "LowOilLevelSwitch": 0, "LowOilPressure": 0, "MaintAlarm": 0, "OilPressureSenderFault": 0, "RunningStatus": 0, "EmergencyStop": 0, "FailToStart": 0 };
                    context.log("[Default prevValues] ");
                }
            } else {
                client.signalEntity(entityId, "addModel", contModel);
                curState[contModel] = {};
                client.signalEntity(entityId, "addDevice", contModel + "~" + req.device.deviceId);
                prevValues = { "AlarmCount": 0, "EngineSpeed": 0, "ControlMode": -1, "ControlModeAuto": 0, "ControlModeTest": 0, "ControlModeManual": 0, "ControlModeStop": 0, "MainL1Voltage": 0, "EngineRunTime": 0, "NumberOfStarts": 0, "ChargeAltFailure": 0, "FailToStop": 0, "LowFuelLevel": 0, "HighCoolantTemp": 0, "GenHighCurrent": 0, "GenOverFreq": 0, "HighTempSwitch": 0, "GenHighVoltage": 0, "BatteryLowVoltage": 0, "GenUnderFreq": 0, "LowOilLevelSwitch": 0, "LowOilPressure": 0, "MaintAlarm": 0, "OilPressureSenderFault": 0, "RunningStatus": 0, "EmergencyStop": 0, "FailToStart": 0 };
                context.log("[Default prevValues] ");
            }
            context.log("[CHANGE LOG START]");
        }

        //Assign new values to local variables
        let mp = curTel.MP;
        let reading = (typeof (curTel.Reading) == "string" ? JSON.parse(curTel.Reading) : curTel.Reading)[0];

        switch (contModel) {
            case "SmartgenHGM6000":
                //Check which Monitoring Point
                switch (mp) {
                    case "EngineSpeed":
                        prevValues.EngineSpeed = prevValues.EngineSpeed??0;
                        if ((reading > (1.05 * prevValues.EngineSpeed) || reading < (0.95 * prevValues.EngineSpeed))) { context.log("Engine Speed changed " + prevValues.EngineSpeed + " => " + reading); prevValues.EngineSpeed = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "MainL1Voltage":
                        prevValues.MainL1Voltage = prevValues.MainL1Voltage??0;
                        if ((reading > (1.05 * prevValues.MainL1Voltage) || reading < (0.95 * prevValues.MainL1Voltage))) { context.log("MainL1Voltage changed " + prevValues.MainL1Voltage + " => " + reading); prevValues.MainL1Voltage = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "EngineRunTime":
                        if (reading != prevValues.EngineRunTime) { context.log("EngineRunTime changed " + prevValues.EngineRunTime + " => " + reading); prevValues.EngineRunTime = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "NumberOfStarts":
                        if (reading != prevValues.NumberOfStarts) { context.log("NumberOfStarts changed " + prevValues.NumberOfStarts + " => " + reading); prevValues.NumberOfStarts = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "ChargeAltFailure":
                        if (reading != prevValues.ChargeAltFailure) { if (prevValues.ChargeAltFailure == 0 && reading == 1) { req.measurements.AllAlarms = 1; exportData = true; context.log("ChargeAltFailure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.ChargeAltFailure = reading; }
                        break;
                    case "FailToStop":
                        if (reading != prevValues.FailToStop) { if (prevValues.FailToStop == 0 && reading == 1) { req.measurements.AllAlarms = 3; exportData = true; context.log("FailToStop changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.FailToStop = reading; }
                        break;
                    case "LowFuelLevel":
                        if (reading != prevValues.LowFuelLevel) { if (prevValues.LowFuelLevel == 0 && reading == 1) { req.measurements.AllAlarms = 4; exportData = true; context.log("LowFuelLevel changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowFuelLevel = reading; }
                        break;
                    case "HighCoolantTemp":
                        if (reading != prevValues.HighCoolantTemp) { if (prevValues.HighCoolantTemp == 0 && reading == 1) { req.measurements.AllAlarms = 5; exportData = true; context.log("HighCoolantTemp changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighCoolantTemp = reading; }
                        break;
                    case "GenHighCurrent":
                        if (reading != prevValues.GenHighCurrent) { if (prevValues.GenHighCurrent == 0 && reading == 1) { req.measurements.AllAlarms = 6; exportData = true; context.log("GenHighCurrent changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighCurrent = reading; }
                        break;
                    case "GenOverFreq":
                        if (reading != prevValues.GenOverFreq) { if (prevValues.GenOverFreq == 0 && reading == 1) { req.measurements.AllAlarms = 7; exportData = true; context.log("GenOverFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenOverFreq = reading; }
                        break;
                    case "HighTempSwitch":
                        if (reading != prevValues.HighTempSwitch) { if (prevValues.HighTempSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 8; exportData = true; context.log("HighTempSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighTempSwitch = reading; }
                        break;
                    case "GenHighVoltage":
                        if (reading != prevValues.GenHighVoltage) { if (prevValues.GenHighVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 9; exportData = true; context.log("GenHighVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighVoltage = reading; }
                        break;
                    case "BatteryLowVoltage":
                        if (reading != prevValues.BatteryLowVoltage) { if (prevValues.BatteryLowVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 10; exportData = true; context.log("BatteryLowVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.BatteryLowVoltage = reading; }
                        break;
                    case "GenUnderFreq":
                        if (reading != prevValues.GenUnderFreq) { if (prevValues.GenUnderFreq == 0 && reading == 1) { req.measurements.AllAlarms = 11; exportData = true; context.log("GenUnderFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenUnderFreq = reading; }
                        break;
                    case "LowOilLevelSwitch":
                        if (reading != prevValues.LowOilLevelSwitch) { if (prevValues.LowOilLevelSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 12; exportData = true; context.log("LowOilLevelSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilLevelSwitch = reading; }
                        break;
                    case "LowOilPressure":
                        if (reading != prevValues.LowOilPressure) { if (prevValues.LowOilPressure == 0 && reading == 1) { req.measurements.AllAlarms = 13; exportData = true; context.log("LowOilPressure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilPressure = reading; }
                        break;
                    case "MaintAlarm":
                        if (reading != prevValues.MaintAlarm) { if (prevValues.MaintAlarm == 0 && reading == 1) { req.measurements.AllAlarms = 14; exportData = true; context.log("MaintAlarm changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.MaintAlarm = reading; }
                        break;
                    case "OilPressureSenderFault":
                        if (reading != prevValues.OilPressureSenderFault) { if (prevValues.OilPressureSenderFault == 0 && reading == 1) { req.measurements.AllAlarms = 15; exportData = true; context.log("OilPressureSenderFault changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.OilPressureSenderFault = reading; }
                        break;
                    case "EmergencyStop":
                        if (reading != prevValues.EmergencyStop) { req.measurements[mp] = reading == 1 ? 3 : 1; exportData = true; context.log("EmergencyStop changed"); prevValues.EmergencyStop = reading; }
                        break;
                    case "RunningStatus":
                        reading = reading == 9 || reading == 7 ? 2 : 1;
                        if (reading != prevValues.RunningStatus) { req.measurements[mp] = reading; exportData = true; context.log("RunningStatus changed"); prevValues.RunningStatus = reading; }
                        break;
                    case "FailToStart":
                        if (reading != prevValues.FailToStart) { req.measurements[mp] = reading; exportData = true; context.log("FailToStart changed"); prevValues.FailToStart = reading; }
                        break;
                    case "ControlModeAuto":
                        if (reading != prevValues.ControlModeAuto && reading == 1) { req.measurements.ControlMode = 1; exportData = true; context.log("ControlMode set to Auto"); } prevValues.ControlModeAuto = reading;
                        break;
                    case "ControlModeManual":
                        if (reading != prevValues.ControlModeManual && reading == 1) { req.measurements.ControlMode = 2; exportData = true; context.log("ControlMode set to Manual"); } prevValues.ControlModeManual = reading;
                        break;
                    case "ControlModeStop":
                        if (reading != prevValues.ControlModeStop && reading == 1) { req.measurements.ControlMode = 0; exportData = true; context.log("ControlMode set to Stop"); } prevValues.ControlModeStop = reading;
                        break;
                    case "ControlModeTest":
                        if (reading != prevValues.ControlModeTest && reading == 1) { req.measurements.ControlMode = 3; exportData = true; context.log("ControlMode set to Test"); } prevValues.ControlModeTest = reading;
                        break;
                    default:
                        req.measurements[mp] = reading;
                        exportData = true;
                }
                break;
            case "DeepseaDSE":
                switch (mp) {
                    case "EngineSpeed":
                        prevValues.EngineSpeed = prevValues.EngineSpeed??0;
                        if ((reading > (1.05 * prevValues.EngineSpeed) || reading < (0.95 * prevValues.EngineSpeed))) { context.log("Engine Speed changed " + prevValues.EngineSpeed + " => " + reading); prevValues.EngineSpeed = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "MainL1Voltage":
                        prevValues.MainL1Voltage = prevValues.MainL1Voltage??0;
                        if ((reading > (1.05 * prevValues.MainL1Voltage) || reading < (0.95 * prevValues.MainL1Voltage))) { context.log("MainL1Voltage changed " + prevValues.MainL1Voltage + " => " + reading); prevValues.MainL1Voltage = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "EngineRunTime":
                        if (reading != prevValues.EngineRunTime) { prevValues.EngineRunTime = reading; req.measurements[mp] = reading; exportData = true; context.log("EngineRunTime changed"); }
                        break;
                    case "NumberOfStarts":
                        if (reading != prevValues.NumberOfStarts) { prevValues.NumberOfStarts = reading; req.measurements[mp] = reading; exportData = true; context.log("NumberOfStarts changed"); }
                        break;
                    case "ChargeAltFailure":
                        reading = reading >> 12;
                        reading = reading % 16;
                        if (reading != prevValues.ChargeAltFailure) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 1; exportData = true; context.log("ChargeAltFailure changed"); } prevValues.ChargeAltFailure = reading; }
                        break;
                    case "FailToStop":
                        reading = reading >> 4;
                        reading = reading % 16;
                        if (reading != prevValues.FailToStop) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 3; exportData = true; context.log("FailToStop changed"); } prevValues.FailToStop = reading; }
                        break;
                    case "LowFuelLevel":
                        reading = reading >> 4;
                        reading = reading % 16;
                        if (reading != prevValues.LowFuelLevel) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 4; exportData = true; context.log("LowFuelLevel changed"); } prevValues.LowFuelLevel = reading; }
                        break;
                    case "HighCoolantTemp":
                        reading = reading >> 4;
                        reading = reading % 16; // >1 && (<> 8 || <> 9)
                        if (reading != prevValues.HighCoolantTemp) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 5; exportData = true; context.log("HighCoolantTemp changed"); } prevValues.HighCoolantTemp = reading; }
                        break;
                    case "GenHighCurrent":
                        reading = reading >> 12;
                        reading = reading % 16;
                        if (reading != prevValues.GenHighCurrent) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 6; exportData = true; context.log("GenHighCurrent Processed"); } prevValues.GenHighCurrent = reading; }
                        break;
                    case "GenOverFreq":
                        reading = reading % 16;
                        if (reading != prevValues.GenOverFreq) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 7; exportData = true; context.log("GenOverFreq Processed"); } prevValues.GenOverFreq = reading; }
                        break;
                    case "HighTempSwitch":
                        reading = reading % 16;
                        if (reading != prevValues.HighTempSwitch) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 8; exportData = true; context.log("HighTempSwitch Processed"); } prevValues.HighTempSwitch = reading; }
                        break;
                    case "GenHighVoltage":
                        reading = reading >> 8;
                        reading = reading % 16;
                        if (reading != prevValues.GenHighVoltage) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 9; exportData = true; context.log("GenHighVoltage changed"); } prevValues.GenHighVoltage = reading; }
                        break;
                    case "BatteryLowVoltage":
                        reading = reading >> 4;
                        reading = reading % 16;
                        if (reading != prevValues.BatteryLowVoltage) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 10; exportData = true; context.log("BatteryLowVoltage changed"); } prevValues.BatteryLowVoltage = reading; }
                        break;
                    case "GenUnderFreq":
                        reading = reading >> 4;
                        reading = reading % 16;
                        if (reading != prevValues.GenUnderFreq) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 11; exportData = true; context.log("GenUnderFreq changed"); } prevValues.GenUnderFreq = reading; }
                        break;
                    case "LowOilLevelSwitch":
                        reading = reading >> 4;
                        reading = reading % 16;
                        if (reading != prevValues.LowOilLevelSwitch) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 12; exportData = true; context.log("LowOilLevelSwitch changed"); } prevValues.LowOilLevelSwitch = reading; }
                        break;
                    case "LowOilPressure":
                        reading = reading >> 8;
                        reading = reading % 16;
                        if (reading != prevValues.LowOilPressure) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 13; exportData = true; context.log("LowOilPressure changed"); } prevValues.LowOilPressure = reading; }
                        break;
                    case "MaintAlarm":
                        reading = reading % 16;
                        if (reading != prevValues.MaintAlarm) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 14; exportData = true; context.log("MaintAlarm changed"); } prevValues.MaintAlarm = reading; }
                        break;
                    case "OilPressureSenderFault":
                        reading = reading >> 8;
                        reading = reading % 16;
                        if (reading != prevValues.OilPressureSenderFault) { if (reading >1 && reading != 8 && reading != 9 ) { req.measurements.AllAlarms = 15; exportData = true; context.log("OilPressureSenderFault changed"); } prevValues.OilPressureSenderFault = reading; }
                        break;
                    case "EmergencyStop":
                        reading = reading >> 12;
                        reading = reading % 16;
                        if (reading != prevValues.EmergencyStop) { req.measurements[mp] = reading; exportData = true; context.log("EmergencyStop changed"); prevValues.EmergencyStop = reading; }
                        break;
                    case "RunningStatus":
                        if (reading != prevValues.RunningStatus) { req.measurements[mp] = reading == 3 ? 2 : 1; exportData = true; context.log("RunningStatus changed"); prevValues.RunningStatus = reading; }
                        break;
                    case "FailToStart":
                        reading = reading >> 8;
                        reading = reading % 16;
                        if (reading != prevValues.FailToStart) { req.measurements[mp] = reading; exportData = true; context.log("FailToStart changed"); prevValues.FailToStart = reading; }
                        break;
                    case "ControlMode":
                        if (reading != prevValues.ControlMode) { req.measurements[mp] = reading; exportData = true; context.log("ControlMode changed"); prevValues.ControlMode = reading; }
                        break;
                    default:
                        req.measurements[mp] = reading;
                        exportData = true;
                }
                break;
            case "DeepseaDSEX":
                switch (mp) {
                    case "EngineSpeed":
                        prevValues.EngineSpeed = prevValues.EngineSpeed??0;
                        if ((reading > (1.05 * prevValues.EngineSpeed) || reading < (0.95 * prevValues.EngineSpeed))) { context.log("Engine Speed changed " + prevValues.EngineSpeed + " => " + reading); prevValues.EngineSpeed = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "MainL1Voltage":
                        prevValues.MainL1Voltage = prevValues.MainL1Voltage??0;
                        if ((reading > (1.05 * prevValues.MainL1Voltage) || reading < (0.95 * prevValues.MainL1Voltage))) { context.log("MainL1Voltage changed " + prevValues.MainL1Voltage + " => " + reading); prevValues.MainL1Voltage = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "EngineRunTime":
                        if (reading != prevValues.EngineRunTime) { context.log("EngineRunTime changed " + prevValues.EngineRunTime + " => " + reading); prevValues.EngineRunTime = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "NumberOfStarts":
                        if (reading != prevValues.NumberOfStarts) { context.log("NumberOfStarts changed " + prevValues.NumberOfStarts + " => " + reading); prevValues.NumberOfStarts = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "ChargeAltFailure":
                        if (reading != prevValues.ChargeAltFailure) { if (prevValues.ChargeAltFailure == 0 && reading == 1) { req.measurements.AllAlarms = 1; exportData = true; context.log("ChargeAltFailure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.ChargeAltFailure = reading; }
                        break;
                    case "FailToStop":
                        if (reading != prevValues.FailToStop) { if (prevValues.FailToStop == 0 && reading == 1) { req.measurements.AllAlarms = 3; exportData = true; context.log("FailToStop changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.FailToStop = reading; }
                        break;
                    case "LowFuelLevel":
                        if (reading != prevValues.LowFuelLevel) { if (prevValues.LowFuelLevel == 0 && reading == 1) { req.measurements.AllAlarms = 4; exportData = true; context.log("LowFuelLevel changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowFuelLevel = reading; }
                        break;
                    case "HighCoolantTemp":
                        if (reading != prevValues.HighCoolantTemp) { if (prevValues.HighCoolantTemp == 0 && reading == 1) { req.measurements.AllAlarms = 5; exportData = true; context.log("HighCoolantTemp changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighCoolantTemp = reading; }
                        break;
                    case "GenHighCurrent":
                        if (reading != prevValues.GenHighCurrent) { if (prevValues.GenHighCurrent == 0 && reading == 1) { req.measurements.AllAlarms = 6; exportData = true; context.log("GenHighCurrent changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighCurrent = reading; }
                        break;
                    case "GenOverFreq":
                        if (reading != prevValues.GenOverFreq) { if (prevValues.GenOverFreq == 0 && reading == 1) { req.measurements.AllAlarms = 7; exportData = true; context.log("GenOverFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenOverFreq = reading; }
                        break;
                    case "HighTempSwitch":
                        if (reading != prevValues.HighTempSwitch) { if (prevValues.HighTempSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 8; exportData = true; context.log("HighTempSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighTempSwitch = reading; }
                        break;
                    case "GenHighVoltage":
                        if (reading != prevValues.GenHighVoltage) { if (prevValues.GenHighVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 9; exportData = true; context.log("GenHighVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighVoltage = reading; }
                        break;
                    case "BatteryLowVoltage":
                        if (reading != prevValues.BatteryLowVoltage) { if (prevValues.BatteryLowVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 10; exportData = true; context.log("BatteryLowVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.BatteryLowVoltage = reading; }
                        break;
                    case "GenUnderFreq":
                        if (reading != prevValues.GenUnderFreq) { if (prevValues.GenUnderFreq == 0 && reading == 1) { req.measurements.AllAlarms = 11; exportData = true; context.log("GenUnderFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenUnderFreq = reading; }
                        break;
                    case "LowOilLevelSwitch":
                        if (reading != prevValues.LowOilLevelSwitch) { if (prevValues.LowOilLevelSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 12; exportData = true; context.log("LowOilLevelSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilLevelSwitch = reading; }
                        break;
                    case "LowOilPressure":
                        if (reading != prevValues.LowOilPressure) { if (prevValues.LowOilPressure == 0 && reading == 1) { req.measurements.AllAlarms = 13; exportData = true; context.log("LowOilPressure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilPressure = reading; }
                        break;
                    case "MaintAlarm":
                        if (reading != prevValues.MaintAlarm) { if (prevValues.MaintAlarm == 0 && reading == 1) { req.measurements.AllAlarms = 14; exportData = true; context.log("MaintAlarm changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.MaintAlarm = reading; }
                        break;
                    case "OilPressureSenderFault":
                        if (reading != prevValues.OilPressureSenderFault) { if (prevValues.OilPressureSenderFault == 0 && reading == 1) { req.measurements.AllAlarms = 15; exportData = true; context.log("OilPressureSenderFault changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.OilPressureSenderFault = reading; }
                        break;
                    case "EmergencyStop":
                        if (reading != prevValues.EmergencyStop) { req.measurements[mp] = reading; exportData = trureadinge; context.log("EmergencyStop changed"); prevValues.EmergencyStop = reading; }
                        break;
                    case "RunningStatus":
                        if (reading != prevValues.RunningStatus) { req.measurements[mp] = reading == 3 ? 2 : 1; exportData = true; context.log("RunningStatus changed"); prevValues.RunningStatus = reading; }
                        break;
                    case "FailToStart":
                        if (reading != prevValues.FailToStart) { req.measurements[mp] = reading; exportData = true; context.log("FailToStart changed"); prevValues.FailToStart = reading; }
                        break;
                    case "ControlMode":
                        if (reading != prevValues.ControlMode) { req.measurements[mp] = reading; exportData = true; context.log("ControlMode changed"); prevValues.ControlMode = reading; }
                        break;
                    default:
                        req.measurements[mp] = reading;
                        exportData = true;
                }
                break;
            case "SmartgenHGM7000":
                    //Check which Monitoring Point
                    switch (mp) {
                        case "EngineSpeed":
                            reading = reading>10000?0:reading;
                            prevValues.EngineSpeed = prevValues.EngineSpeed??0;
                            if ((reading > (1.05 * prevValues.EngineSpeed) || reading < (0.95 * prevValues.EngineSpeed))) { context.log("Engine Speed changed " + prevValues.EngineSpeed + " => " + reading); prevValues.EngineSpeed = reading; req.measurements[mp] = reading; exportData = true; }
                            break;
                        case "MainL1Voltage":
                            prevValues.MainL1Voltage = prevValues.MainL1Voltage??0;
                            if ((reading > (1.05 * prevValues.MainL1Voltage) || reading < (0.95 * prevValues.MainL1Voltage))) { context.log("MainL1Voltage changed " + prevValues.MainL1Voltage + " => " + reading); prevValues.MainL1Voltage = reading; req.measurements[mp] = reading; exportData = true; }
                            break;
                        case "EngineRunTime":
                            if (reading != prevValues.EngineRunTime) { context.log("EngineRunTime changed " + prevValues.EngineRunTime + " => " + reading); prevValues.EngineRunTime = reading; req.measurements[mp] = reading; exportData = true; }
                            break;
                        case "NumberOfStarts":
                            if (reading != prevValues.NumberOfStarts) { context.log("NumberOfStarts changed " + prevValues.NumberOfStarts + " => " + reading); prevValues.NumberOfStarts = reading; req.measurements[mp] = reading; exportData = true; }
                            break;
                        case "ChargeAltFailure":
                            reading = reading >> 9;
                            reading = reading % 2;
                            if (reading != prevValues.ChargeAltFailure) { if (prevValues.ChargeAltFailure == 0 && reading == 1) { req.measurements.AllAlarms = 1; exportData = true; context.log("ChargeAltFailure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.ChargeAltFailure = reading; }
                            break;
                        case "FailToStop":
                            reading = reading >> 8;
                            reading = reading % 2;
                            if (reading != prevValues.FailToStop) { if (prevValues.FailToStop == 0 && reading == 1) { req.measurements.AllAlarms = 3; exportData = true; context.log("FailToStop changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.FailToStop = reading; }
                            break;
                        case "LowFuelLevel":
                            reading = reading >> 2;
                            reading = reading % 2;
                            if (reading != prevValues.LowFuelLevel) { if (prevValues.LowFuelLevel == 0 && reading == 1) { req.measurements.AllAlarms = 4; exportData = true; context.log("LowFuelLevel changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowFuelLevel = reading; }
                            break;
                        case "HighCoolantTemp":
                            reading = reading >> 9;
                            reading = reading % 2;
                            if (reading != prevValues.HighCoolantTemp) { if (prevValues.HighCoolantTemp == 0 && reading == 1) { req.measurements.AllAlarms = 5; exportData = true; context.log("HighCoolantTemp changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighCoolantTemp = reading; }
                            break;
                        case "GenHighCurrent":
                            reading = reading >> 7;
                            reading = reading % 2;
                            if (reading != prevValues.GenHighCurrent) { if (prevValues.GenHighCurrent == 0 && reading == 1) { req.measurements.AllAlarms = 6; exportData = true; context.log("GenHighCurrent changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighCurrent = reading; }
                            break;
                        case "GenOverFreq":
                            reading = reading >> 3;
                            reading = reading % 2;
                            if (reading != prevValues.GenOverFreq) { if (prevValues.GenOverFreq == 0 && reading == 1) { req.measurements.AllAlarms = 7; exportData = true; context.log("GenOverFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenOverFreq = reading; }
                            break;
                        case "HighTempSwitch":
                            reading = reading >> 9;
                            reading = reading % 2;
                            if (reading != prevValues.HighTempSwitch) { if (prevValues.HighTempSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 8; exportData = true; context.log("HighTempSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighTempSwitch = reading; }
                            break;
                        case "GenHighVoltage":
                            reading = reading >> 6;
                            reading = reading % 2;
                            if (reading != prevValues.GenHighVoltage) { if (prevValues.GenHighVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 9; exportData = true; context.log("GenHighVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighVoltage = reading; }
                            break;
                        case "BatteryLowVoltage":
                            reading = reading >> 11;
                            reading = reading % 2;
                            if (reading != prevValues.BatteryLowVoltage) { if (prevValues.BatteryLowVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 10; exportData = true; context.log("BatteryLowVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.BatteryLowVoltage = reading; }
                            break;
                        case "GenUnderFreq":
                            reading = reading >> 4;
                            reading = reading % 2;
                            if (reading != prevValues.GenUnderFreq) { if (prevValues.GenUnderFreq == 0 && reading == 1) { req.measurements.AllAlarms = 11; exportData = true; context.log("GenUnderFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenUnderFreq = reading; }
                            break;
                        case "LowOilLevelSwitch":
                            if (reading != prevValues.LowOilLevelSwitch) { if (prevValues.LowOilLevelSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 12; exportData = true; context.log("LowOilLevelSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilLevelSwitch = reading; }
                            break;
                        case "LowOilPressure":
                            reading = reading >> 14;
                            reading = reading % 2;
                            if (reading != prevValues.LowOilPressure) { if (prevValues.LowOilPressure == 0 && reading == 1) { req.measurements.AllAlarms = 13; exportData = true; context.log("LowOilPressure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilPressure = reading; }
                            break;
                        case "MaintAlarm":
                            reading = reading >> 10;
                            reading = reading % 2;
                            if (reading != prevValues.MaintAlarm) { if (prevValues.MaintAlarm == 0 && reading == 1) { req.measurements.AllAlarms = 14; exportData = true; context.log("MaintAlarm changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.MaintAlarm = reading; }
                            break;
                        case "OilPressureSenderFault":
                            reading = reading >> 12;
                            reading = reading % 2;
                            if (reading != prevValues.OilPressureSenderFault) { if (prevValues.OilPressureSenderFault == 0 && reading == 1) { req.measurements.AllAlarms = 15; exportData = true; context.log("OilPressureSenderFault changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.OilPressureSenderFault = reading; }
                            break;
                        case "EmergencyStop":
                            reading = reading % 2;
                            if (reading != prevValues.EmergencyStop) { req.measurements[mp] = reading == 1 ? 3 : 1; exportData = true; context.log("EmergencyStop changed"); prevValues.EmergencyStop = reading; }
                            break;
                        case "RunningStatus":
                            reading = reading == 9 || reading == 7 ? 2 : 1;
                            if (reading != prevValues.RunningStatus) { req.measurements[mp] = reading ; exportData = true; context.log("RunningStatus changed"); prevValues.RunningStatus = reading; }
                            break;
                        case "FailToStart":
                            reading = reading >> 8;
                            reading = reading % 2;
                            if (reading != prevValues.FailToStart) { req.measurements[mp] = reading; exportData = true; context.log("FailToStart changed"); prevValues.FailToStart = reading; }
                            break;
                        case "ControlModeAuto":
                            reading = reading >> 9;
                            reading = reading % 2;
                            if (reading != prevValues.ControlModeAuto && reading == 1) { req.measurements.ControlMode = 1; exportData = true; context.log("ControlMode set to Auto"); } prevValues.ControlModeAuto = reading;
                            break;
                        case "ControlModeManual":
                            reading = reading >> 10;
                            reading = reading % 2;
                            if (reading != prevValues.ControlModeManual && reading == 1) { req.measurements.ControlMode = 2; exportData = true; context.log("ControlMode set to Manual"); } prevValues.ControlModeManual = reading;
                            break;
                        case "ControlModeStop":
                            reading = reading >> 11;
                            reading = reading % 2;
                            if (reading != prevValues.ControlModeStop && reading == 1) { req.measurements.ControlMode = 0; exportData = true; context.log("ControlMode set to Stop"); } prevValues.ControlModeStop = reading;
                            break;
                        case "ControlModeTest":
                            reading = reading >> 12;
                            reading = reading % 2;
                            if (reading != prevValues.ControlModeTest && reading == 1) { req.measurements.ControlMode = 3; exportData = true; context.log("ControlMode set to Test"); } prevValues.ControlModeTest = reading;
                            break;
                        default:
                            reading = reading>10000?0:reading;
                            req.measurements[mp] = reading;
                            exportData = true;
                    }
                    break;
            case "InteliLite":
                //Check which Monitoring Point
                switch (mp) {
                    case "EngineSpeed":
                        prevValues.EngineSpeed = prevValues.EngineSpeed ?? 0;
                        if ((reading > (1.05 * prevValues.EngineSpeed) || reading < (0.95 * prevValues.EngineSpeed))) { context.log("Engine Speed changed " + prevValues.EngineSpeed + " => " + reading); prevValues.EngineSpeed = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "MainL1Voltage":
                        prevValues.MainL1Voltage = prevValues.MainL1Voltage ?? 0;
                        if ((reading > (1.05 * prevValues.MainL1Voltage) || reading < (0.95 * prevValues.MainL1Voltage))) { context.log("MainL1Voltage changed " + prevValues.MainL1Voltage + " => " + reading); prevValues.MainL1Voltage = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "EngineRunTime":
                        if (reading != prevValues.EngineRunTime) { context.log("EngineRunTime changed " + prevValues.EngineRunTime + " => " + reading); prevValues.EngineRunTime = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "NumberOfStarts":
                        if (reading != prevValues.NumberOfStarts) { context.log("NumberOfStarts changed " + prevValues.NumberOfStarts + " => " + reading); prevValues.NumberOfStarts = reading; req.measurements[mp] = reading; exportData = true; }
                        break;
                    case "ChargeAltFailure":
                        if (reading != prevValues.ChargeAltFailure) { if (prevValues.ChargeAltFailure == 0 && reading == 1) { req.measurements.AllAlarms = 1; exportData = true; context.log("ChargeAltFailure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.ChargeAltFailure = reading; }
                        break;
                    case "FailToStop":
                        if (reading != prevValues.FailToStop) { if (prevValues.FailToStop == 0 && reading == 1) { req.measurements.AllAlarms = 3; exportData = true; context.log("FailToStop changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.FailToStop = reading; }
                        break;
                    case "LowFuelLevel":
                        if (reading != prevValues.LowFuelLevel) { if (prevValues.LowFuelLevel == 0 && reading == 1) { req.measurements.AllAlarms = 4; exportData = true; context.log("LowFuelLevel changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowFuelLevel = reading; }
                        break;
                    case "HighCoolantTemp":
                        reading = (reading >> 4)%2;
                        if (reading != prevValues.HighCoolantTemp) { if (prevValues.HighCoolantTemp == 0 && reading == 1) { req.measurements.AllAlarms = 5; exportData = true; context.log("HighCoolantTemp changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighCoolantTemp = reading; }
                        break;
                    case "GenHighCurrent":
                        if (reading != prevValues.GenHighCurrent) { if (prevValues.GenHighCurrent == 0 && reading == 1) { req.measurements.AllAlarms = 6; exportData = true; context.log("GenHighCurrent changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighCurrent = reading; }
                        break;
                    case "GenOverFreq":
                        if (reading != prevValues.GenOverFreq) { if (prevValues.GenOverFreq == 0 && reading == 1) { req.measurements.AllAlarms = 7; exportData = true; context.log("GenOverFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenOverFreq = reading; }
                        break;
                    case "HighTempSwitch":
                        if (reading != prevValues.HighTempSwitch) { if (prevValues.HighTempSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 8; exportData = true; context.log("HighTempSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.HighTempSwitch = reading; }
                        break;
                    case "GenHighVoltage":
                        if (reading != prevValues.GenHighVoltage) { if (prevValues.GenHighVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 9; exportData = true; context.log("GenHighVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenHighVoltage = reading; }
                        break;
                    case "BatteryLowVoltage":
                        if (reading != prevValues.BatteryLowVoltage) { if (prevValues.BatteryLowVoltage == 0 && reading == 1) { req.measurements.AllAlarms = 10; exportData = true; context.log("BatteryLowVoltage changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.BatteryLowVoltage = reading; }
                        break;
                    case "GenUnderFreq":
                        if (reading != prevValues.GenUnderFreq) { if (prevValues.GenUnderFreq == 0 && reading == 1) { req.measurements.AllAlarms = 11; exportData = true; context.log("GenUnderFreq changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.GenUnderFreq = reading; }
                        break;
                    case "LowOilLevelSwitch":
                        if (reading != prevValues.LowOilLevelSwitch) { if (prevValues.LowOilLevelSwitch == 0 && reading == 1) { req.measurements.AllAlarms = 12; exportData = true; context.log("LowOilLevelSwitch changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilLevelSwitch = reading; }
                        break;
                    case "LowOilPressure":
                        reading = (reading >> 3)%2;
                        if (reading != prevValues.LowOilPressure) { if (prevValues.LowOilPressure == 0 && reading == 1) { req.measurements.AllAlarms = 13; exportData = true; context.log("LowOilPressure changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.LowOilPressure = reading; }
                        break;
                    case "MaintAlarm":
                        if (reading != prevValues.MaintAlarm) { if (prevValues.MaintAlarm == 0 && reading == 1) { req.measurements.AllAlarms = 14; exportData = true; context.log("MaintAlarm changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.MaintAlarm = reading; }
                        break;
                    case "OilPressureSenderFault":
                        if (reading != prevValues.OilPressureSenderFault) { if (prevValues.OilPressureSenderFault == 0 && reading == 1) { req.measurements.AllAlarms = 15; exportData = true; context.log("OilPressureSenderFault changed"); prevValues.AlarmCount++; } else { if (prevValues.AlarmCount == 1) { req.measurements.AllAlarms = 0; exportData = true; context.log("All Alarms Closed"); } prevValues.AlarmCount--; } prevValues.OilPressureSenderFault = reading; }
                        break;
                    case "EmergencyStop":
                        reading = (reading >> 2)%2;
                        if (reading != prevValues.EmergencyStop) { req.measurements[mp] = reading==1?1:3; exportData = true; context.log("EmergencyStop changed"); prevValues.EmergencyStop = reading; }
                        break;
                    case "RunningStatus":
                        reading = reading == 29? 2 : 1;
                        if (reading != prevValues.RunningStatus) { req.measurements[mp] = reading; exportData = true; context.log("RunningStatus changed"); prevValues.RunningStatus = reading; }
                        break;
                    case "FailToStart":
                        if (reading != prevValues.FailToStart) { req.measurements[mp] = reading; exportData = true; context.log("FailToStart changed"); prevValues.FailToStart = reading; }
                        break;
                    case "ControlMode":
                        if (reading != prevValues.ControlMode) { req.measurements[mp] = reading==2?1:reading==1?2:reading; exportData = true; context.log("ControlMode changed"); prevValues.ControlMode = reading; }
                        break;
                    default:
                        req.measurements[mp] = reading;
                        exportData = true;
                }
                break;
            default:
                context.log("[Controller model unidentified]");
                return;
        }

    });
    context.log("[CHANGE LOG END]");
    
    prevValues.ModelId = req.device.modelId;
    prevValues.ReadingOn = Date.now();
    client.signalEntity(entityId, "setStates", contModel + "~" + req.device.deviceId + "~" + JSON.stringify(prevValues));
    //context.log("[Entity updated with new values] " + JSON.stringify(prevValues));

    if (!exportData) {
        context.log("[INFO] No changes to export.")
        return;
    }
    //Apply any scaling required
    req = updateValues(req, contModel);

    // Send to IoTC
    try {
        context.log("[Request parameters sent to handler] " + JSON.stringify(req));
        await handleMessage({ ...parameters, log: context.log, getSecret: getKeyVaultSecret }, req.device, req.measurements, context.bindingData.enqueuedTimeUtcArray);
    } catch (e) {
        context.log('[ERROR]', e.message);
        throw e;
    }
};


//Update values function to scale telemetry based on model
function updateValues(req, model) {
    let updatedReq = req;
    switch (model) {
        case "SmartgenHGM6000":
            updatedReq = scaleSmartgenHGM6000(req);
            break;
        case "DeepseaDSE":
            updatedReq = scaleDeepseaDSE(req);
            break;
        case "DeepseaDSEX" :
            updatedReq = scaleDeepseaDSEX(req);
            break;
        case "SmartgenHGM7000":
            updatedReq = scaleSmartgenHGM7000(req);
            break;
        case "InteliLite":
            updatedReq = scaleInteliLite(req)
        default:
    }
    return updatedReq;
}
function scaleInteliLite(req) {
    if (Object.keys(req.measurements).includes("EngineBatteryVoltage")) { req.measurements.EngineBatteryVoltage = req.measurements.EngineBatteryVoltage / 10; }
    if (Object.keys(req.measurements).includes("GeneratorFrequency")) { req.measurements.GeneratorFrequency = req.measurements.GeneratorFrequency / 10; }
    if (Object.keys(req.measurements).includes("OilPressure")) { req.measurements.OilPressure = req.measurements.OilPressure * 10; }
    return req;
}
//Scaling function for smartgen HGM 6000 series
function scaleSmartgenHGM6000(req) {
    if (Object.keys(req.measurements).includes("EngineBatteryVoltage")) { req.measurements.EngineBatteryVoltage = req.measurements.EngineBatteryVoltage / 10; }
    if (Object.keys(req.measurements).includes("GeneratorFrequency")) { req.measurements.GeneratorFrequency = req.measurements.GeneratorFrequency / 10; }
    if (Object.keys(req.measurements).includes("ChargeAltVoltage")) { req.measurements.ChargeAltVoltage = req.measurements.ChargeAltVoltage / 10; }
    return req;
}
function scaleSmartgenHGM7000(req) {
    if (Object.keys(req.measurements).includes("EngineBatteryVoltage")) { req.measurements.EngineBatteryVoltage = req.measurements.EngineBatteryVoltage / 10; }
    if (Object.keys(req.measurements).includes("ChargeAltVoltage")) { req.measurements.ChargeAltVoltage = req.measurements.ChargeAltVoltage / 10; }
    if (Object.keys(req.measurements).includes("GenL1Current")) { req.measurements.GenL1Current = req.measurements.GenL1Current / 10; }
    if (Object.keys(req.measurements).includes("GenL2Current")) { req.measurements.GenL2Current = req.measurements.GenL2Current / 10; }
    if (Object.keys(req.measurements).includes("GenL3Current")) { req.measurements.GenL3Current = req.measurements.GenL3Current / 10; }
    return req;
}
function scaleDeepseaDSE(req) {
    if (Object.keys(req.measurements).includes("EngineRunTime")) { req.measurements.EngineRunTime = Math.round(req.measurements.EngineRunTime / 3600); }
    if (Object.keys(req.measurements).includes("ChargeAltVoltage")) { req.measurements.ChargeAltVoltage = req.measurements.ChargeAltVoltage / 10; }
    if (Object.keys(req.measurements).includes("GeneratorFrequency")) { req.measurements.GeneratorFrequency = req.measurements.GeneratorFrequency / 10; }
    if (Object.keys(req.measurements).includes("GenL1Voltage")) { req.measurements.GenL1Voltage = req.measurements.GenL1Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL2Voltage")) { req.measurements.GenL2Voltage = req.measurements.GenL2Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL3Voltage")) { req.measurements.GenL3Voltage = req.measurements.GenL3Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL1Current")) { req.measurements.GenL1Current = req.measurements.GenL1Current / 10; }
    if (Object.keys(req.measurements).includes("GenL2Current")) { req.measurements.GenL2Current = req.measurements.GenL2Current / 10; }
    if (Object.keys(req.measurements).includes("GenL3Current")) { req.measurements.GenL3Current = req.measurements.GenL3Current / 10; }
    if (Object.keys(req.measurements).includes("MainL1Voltage")) { req.measurements.MainL1Voltage = req.measurements.MainL1Voltage / 10; }
    if (Object.keys(req.measurements).includes("MainL2Voltage")) { req.measurements.MainL2Voltage = req.measurements.MainL2Voltage / 10; }
    if (Object.keys(req.measurements).includes("MainL3Voltage")) { req.measurements.MainL3Voltage = req.measurements.MainL3Voltage / 10; }
    if (Object.keys(req.measurements).includes("EngineBatteryVoltage")) { req.measurements.EngineBatteryVoltage = req.measurements.EngineBatteryVoltage / 10; }
    return req;
}
function scaleDeepseaDSEX(req) {
    if (Object.keys(req.measurements).includes("MainL1Voltage")) { req.measurements.MainL1Voltage = req.measurements.MainL1Voltage / 10; }
    if (Object.keys(req.measurements).includes("MainL2Voltage")) { req.measurements.MainL2Voltage = req.measurements.MainL2Voltage / 10; }
    if (Object.keys(req.measurements).includes("MainL3Voltage")) { req.measurements.MainL3Voltage = req.measurements.MainL3Voltage / 10; }
    if (Object.keys(req.measurements).includes("EngineBatteryVoltage")) { req.measurements.EngineBatteryVoltage = req.measurements.EngineBatteryVoltage / 10; }
    return req;
}

/**
 * Fetches a Key Vault secret. Attempts to refresh the token on authorization errors.
 */
async function getKeyVaultSecret(context, secretUrl, forceTokenRefresh = false) {
    if (!kvToken || forceTokenRefresh) {
        const url = `${msiEndpoint}/?resource=https://vault.azure.net&api-version=2017-09-01`;
        const options = {
            method: 'GET',
            headers: { 'Secret': msiSecret }
        };
        try {
            context.log('[HTTP] Requesting new Key Vault token');
            const response = await fetch(url, options).then(res => res.json())
            kvToken = response.access_token;
        } catch (e) {
            context.log('fail: ' + e);
            throw new Error('Unable to get Key Vault token');
        }
    }

    url = `${secretUrl}?api-version=2016-10-01`;
    var options = {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${kvToken}` },
    };

    try {
        context.log('[HTTP] Requesting Key Vault secret', secretUrl);
        const response = await fetch(url, options).then(res => res.json())
        return response && response.value;
    } catch (e) {
        if (e.statusCode === 401 && !forceTokenRefresh) {
            return await getKeyVaultSecret(context, secretUrl, true);
        } else {
            throw new Error('Unable to fetch secret');
        }
    }
}