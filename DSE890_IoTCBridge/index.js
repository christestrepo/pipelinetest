
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

    // GET ENTITY FUNCTION VARIABLES
    const client = df.getClient(context);
    const entityId = new df.EntityId("Entity", "myTelemetry");
    const stateResponse = await client.readEntityState(entityId);
    let curState = stateResponse.entityState ?? {};
    let prevValues = {};
    
    //Entity clear function
    if (IoTHubMessages == "Clear entity") { client.signalEntity(entityId, "clear"); return; }

    // SET LOCAL VARIABLES
    let req = { device: {}, measurements: {} };
    let exportData = false;
    prevValues = { "ModelId":"","ReadingOn":0,"EngineSpeed": 0, "ControlMode": 0, "MainL1Voltage": 0, "EngineRunTime": 0, "NumberOfStarts": 0, "ChargeAltFailure": 0, "FailToStop": 0, "LowFuelLevel": 0, "HighCoolantTemp": 0, "GenHighCurrent": 0, "GenOverFreq": 0, "HighTempSwitch": 0, "GenHighVoltage": 0, "BatteryLowVoltage": 0, "GenUnderFreq": 0, "LowOilLevelSwitch": 0, "LowOilPressure": 0, "MaintAlarm": 0, "OilPressureSenderFault": 0, "EmergencyStop": 0, "RunningStatus": 0, "FailToStart": 0 };

    // SET OUTPUT FORMAT
    req.device.deviceId = Object.keys(IoTHubMessage)[0];
    req.device.modelId = "dtmi:ahmPrd:Generator_2px;1";
    contModel = Object.keys(IoTHubMessage[req.device.deviceId])[0][0] == "N"?"DSE890DEVICE":IoTHubMessage[req.device.deviceId].P003.R001;

    // SET PROCESS PARAMETERS
    let deviceData = (IoTHubMessage[req.device.deviceId]);
    let messages = Object.keys(deviceData);

    //// CREATE MODEL DEVICE IF IT DOES NOT EXIST
    if (curState[contModel]) {
        if (curState[contModel][req.device.deviceId]) {
            prevValues = curState[contModel][req.device.deviceId];
        }
        else {
            client.signalEntity(entityId, "addDevice", contModel + "~" + req.device.deviceId);
            curState[contModel][req.device.deviceId] = {};
        }
    } else {
        client.signalEntity(entityId, "addModel", contModel);
        curState[contModel] = {};
        client.signalEntity(entityId, "addDevice", contModel + "~" + req.device.deviceId);
        curState[contModel][req.device.deviceId] = {};

    }
    context.log("[CHANGE LOG START]");
    // LOOP THROUGH DEVICE DATA
    messages.forEach(datatype => {

        // APPLY PROCESS FOR SPECIFIC MODELS
        switch (contModel) {
            case '6120':
                //CHECK IF ALARM OTHERWISE PROCESS TELEMETRY
                if (datatype[0] == 'N') {
                    let severity = deviceData[datatype].S;
                    switch (datatype) {
                        case 'N000': //EmergencyStop
                            exportData = true; req.measurements["EmergencyStop"] = severity; break;
                        case 'N001': //LowOilPressure
                            exportData = true; req.measurements["AllAlarms"] = 13; break;
                        case 'N002': //HighCoolantTemp
                            exportData = true; req.measurements["AllAlarms"] = 5; break;
                        case 'N006': //GenUnderFreq
                            exportData = true; req.measurements["AllAlarms"] = 11; break;
                        case 'N007': //GenOverFreq
                            exportData = true; req.measurements["AllAlarms"] = 7; break;
                        case 'N009': //GenHighVoltage
                            exportData = true; req.measurements["AllAlarms"] = 9; break;
                        case 'N010': //BatteryLowVoltage
                            exportData = true; req.measurements["AllAlarms"] = 10; break;
                        case 'N012': //ChargeAltFailure
                            exportData = true; req.measurements["AllAlarms"] = 1; break;
                        case 'N013': //FailToStart
                            exportData = true; req.measurements["FailToStart"] = severity; break;
                        case 'N014': //FailToStop 
                            exportData = true; req.measurements["AllAlarms"] = 3; break;
                        case 'N020': //GenHighCurrent 
                            exportData = true; req.measurements["AllAlarms"] = 6; break;
                        case 'N022': //LowFuelLevel 
                            exportData = true; req.measurements["AllAlarms"] = 4; break;
                        case 'N027': //HighTempSwitch 
                            exportData = true; req.measurements["AllAlarms"] = 8; break;
                        case 'N035': //MaintAlarm 
                            exportData = true; req.measurements["AllAlarms"] = 14; break;
                        default:
                            context.log("[Alarm unidentified]");
                    }
                }
                else {
                    // LOOP THROUGH VALUES
                    let valueKeys = Object.keys(deviceData[datatype]);
                    valueKeys.forEach(key => {
                        let newValue = deviceData[datatype][key];
                        switch (datatype + '~' + key) {
                            case 'P003~R004': //ControlMode
                                if (newValue != prevValues.ControlMode) { exportData = true; prevValues.ControlMode = newValue; req.measurements["ControlMode"] = newValue; } break;
                            case 'P004~R006': //EngineSpeed
                                if (newValue > (1.05 * prevValues.EngineSpeed) || newValue < (0.95 * prevValues.EngineSpeed)) { exportData = true; prevValues.EngineSpeed = newValue; req.measurements["EngineSpeed"] = newValue; } break;
                            case 'P004~R036': //MainsL1Voltage
                                if (newValue > (1.05 *prevValues.MainL1Voltage) || newValue < (0.95 * prevValues.MainL1Voltage)) { context.log("Mains L1 Voltage changed");exportData = true; prevValues.MainL1Voltage = newValue; req.measurements["MainL1Voltage"] = newValue; } break;
                            case 'P004~R000': //OilPressure
                                exportData = true; req.measurements["OilPressure"] = newValue; break;
                            case 'P004~R001': //CoolantTemp
                                exportData = true; req.measurements["CoolantTemp"] = newValue; break;
                            case 'P004~R003': //FuelLevel
                                exportData = true; req.measurements["FuelLevel"] = newValue; break;
                            case 'P004~R004': //ChargeAltVoltage
                                exportData = true; req.measurements["ChargeAltVoltage"] = newValue; break;
                            case 'P004~R005': //EngineBatteryVoltage
                                exportData = true; req.measurements["EngineBatteryVoltage"] = newValue; break;
                            case 'P004~R007': //GeneratorFrequency
                                exportData = true; req.measurements["GeneratorFrequency"] = newValue; break;
                            case 'P004~R008': //GenL1Voltage
                                exportData = true; req.measurements["GenL1Voltage"] = newValue; break;
                            case 'P004~R010': //GenL2Voltage
                                exportData = true; req.measurements["GenL2Voltage"] = newValue; break;
                            case 'P004~R012': //GenL3Voltage
                                exportData = true; req.measurements["GenL3Voltage"] = newValue; break;
                            case 'P004~R020': //GenL1Current
                                exportData = true; req.measurements["GenL1Current"] = newValue; break;
                            case 'P004~R022': //GenL2Current
                                exportData = true; req.measurements["GenL2Current"] = newValue; break;
                            case 'P004~R024': //GenL3Current
                                exportData = true; req.measurements["GenL3Current"] = newValue; break;
                            case 'P004~R038': //MainL2Voltage
                                exportData = true; req.measurements["MainL2Voltage"] = newValue; break;
                            case 'P004~R040': //MainL3Voltage
                                exportData = true; req.measurements["MainL3Voltage"] = newValue; break;
                            case 'P005~R128': //RunningStatus
                                if (newValue != prevValues.RunningStatus && (newValue == 3 || prevValues.RunningStatus == 3)) { exportData = true; prevValues.RunningStatus = newValue; req.measurements["RunningStatus"] = newValue==3?2:1; } break;
                            case 'P007~R006': //EngineRunTime
                                exportData = true; req.measurements["EngineRunTime"] = newValue; break;
                            case 'P007~R016': //NumberOfStarts
                                exportData = true; req.measurements["NumberOfStarts"] = newValue; break;
                            default:
                                context.log("[Register unidentified]");
                                return;
                        }
                    });
                }
                break;
            default:
                //CHECK IF ALARM OTHERWISE PROCESS TELEMETRY
                if (datatype[0] == 'N') {
                    let severity = deviceData[datatype].S;
                    switch (datatype) {
                        case 'N000': //EmergencyStop
                            exportData = true; req.measurements["EmergencyStop"] = severity; break;
                        case 'N001': //LowOilPressure
                            exportData = true; req.measurements["AllAlarms"] = 13; break;
                        case 'N002': //HighCoolantTemp
                            exportData = true; req.measurements["AllAlarms"] = 5; break;
                        case 'N006': //GenUnderFreq
                            exportData = true; req.measurements["AllAlarms"] = 11; break;
                        case 'N007': //GenOverFreq
                            exportData = true; req.measurements["AllAlarms"] = 7; break;
                        case 'N009': //GenHighVoltage
                            exportData = true; req.measurements["AllAlarms"] = 9; break;
                        case 'N010': //BatteryLowVoltage
                            exportData = true; req.measurements["AllAlarms"] = 10; break;
                        case 'N012': //ChargeAltFailure
                            exportData = true; req.measurements["AllAlarms"] = 1; break;
                        case 'N013': //FailToStart
                            exportData = true; req.measurements["FailToStart"] = severity; break;
                        case 'N014': //FailToStop 
                            exportData = true; req.measurements["AllAlarms"] = 3; break;
                        case 'N020': //GenHighCurrent 
                            exportData = true; req.measurements["AllAlarms"] = 6; break;
                        case 'N022': //LowFuelLevel 
                            exportData = true; req.measurements["AllAlarms"] = 4; break;
                        case 'N027': //HighTempSwitch 
                            exportData = true; req.measurements["AllAlarms"] = 8; break;
                        case 'N035': //MaintAlarm 
                            exportData = true; req.measurements["AllAlarms"] = 14; break;
                        default:
                            context.log("[Alarm unidentified]");
                    }
                }
                else {
                    // LOOP THROUGH VALUES
                    let valueKeys = Object.keys(deviceData[datatype]);
                    valueKeys.forEach(key => {
                        let newValue = deviceData[datatype][key];
                        switch (datatype + '~' + key) {
                            case 'P003~R004': //ControlMode
                                if (newValue != prevValues.ControlMode) { exportData = true; prevValues.ControlMode = newValue; req.measurements["ControlMode"] = newValue; } break;
                            case 'P004~R006': //EngineSpeed
                                if (newValue > (1.05 * prevValues.EngineSpeed) || newValue < (0.95 * prevValues.EngineSpeed)) { exportData = true; prevValues.EngineSpeed = newValue; req.measurements["EngineSpeed"] = newValue; } break;
                            case 'P004~R036': //MainsL1Voltage
                                if (newValue > (1.05 *prevValues.MainL1Voltage) || newValue < (0.95 * prevValues.MainL1Voltage)) { context.log("Mains L1 Voltage changed");exportData = true; prevValues.MainL1Voltage = newValue; req.measurements["MainL1Voltage"] = newValue; } break;
                            case 'P004~R000': //OilPressure
                                exportData = true; req.measurements["OilPressure"] = newValue; break;
                            case 'P004~R001': //CoolantTemp
                                exportData = true; req.measurements["CoolantTemp"] = newValue; break;
                            case 'P004~R003': //FuelLevel
                                exportData = true; req.measurements["FuelLevel"] = newValue; break;
                            case 'P004~R004': //ChargeAltVoltage
                                exportData = true; req.measurements["ChargeAltVoltage"] = newValue; break;
                            case 'P004~R005': //EngineBatteryVoltage
                                exportData = true; req.measurements["EngineBatteryVoltage"] = newValue; break;
                            case 'P004~R007': //GeneratorFrequency
                                exportData = true; req.measurements["GeneratorFrequency"] = newValue; break;
                            case 'P004~R008': //GenL1Voltage
                                exportData = true; req.measurements["GenL1Voltage"] = newValue; break;
                            case 'P004~R010': //GenL2Voltage
                                exportData = true; req.measurements["GenL2Voltage"] = newValue; break;
                            case 'P004~R012': //GenL3Voltage
                                exportData = true; req.measurements["GenL3Voltage"] = newValue; break;
                            case 'P004~R020': //GenL1Current
                                exportData = true; req.measurements["GenL1Current"] = newValue; break;
                            case 'P004~R022': //GenL2Current
                                exportData = true; req.measurements["GenL2Current"] = newValue; break;
                            case 'P004~R024': //GenL3Current
                                exportData = true; req.measurements["GenL3Current"] = newValue; break;
                            case 'P004~R038': //MainL2Voltage
                                exportData = true; req.measurements["MainL2Voltage"] = newValue; break;
                            case 'P004~R040': //MainL3Voltage
                                exportData = true; req.measurements["MainL3Voltage"] = newValue; break;
                            case 'P005~R128': //RunningStatus
                                if (newValue != prevValues.RunningStatus && (newValue == 3 || prevValues.RunningStatus == 3)) { exportData = true; prevValues.RunningStatus = newValue; req.measurements["RunningStatus"] = newValue==3?2:1; } break;
                            case 'P007~R006': //EngineRunTime
                                exportData = true; req.measurements["EngineRunTime"] = newValue; break;
                            case 'P007~R016': //NumberOfStarts
                                exportData = true; req.measurements["NumberOfStarts"] = newValue; break;
                            default:
                                context.log("[Register unidentified]");
                        }
                    });
                }
            }

        });
    context.log("[CHANGE LOG END]");
    //context.log("[Final values]: " + JSON.stringify(prevValues));
    prevValues.ModelId = req.device.modelId;
    prevValues.ReadingOn = Date.now();
    client.signalEntity(entityId, "setStates", contModel+"~"+req.device.deviceId+"~"+JSON.stringify(prevValues));
    
    if (!exportData) {
        context.log("[INFO] No changes to export.")
        return;
    }
    req = updateValues(req, contModel);
        // Send to IoTC
    try {
        context.log("[Request parameters sent to handler] " + JSON.stringify(req));

        await handleMessage({ ...parameters, log: context.log, getSecret: getKeyVaultSecret }, req.device, req.measurements);
    } catch (e) {
        context.log('[ERROR]', e.message);
        throw e;
    }
};


function updateValues(req, model) {
    let updatedReq = req;
    switch (model) {
        case "6120":
            updatedReq = scale6120(req);
            break;
        case "7320":
            break;
        default:
            updatedReq = scaleGeneral(req);
    }
    return updatedReq;
}

function scaleGeneral(req) {
    if (Object.keys(req.measurements).includes("MainL1Voltage")) { req.measurements.MainL1Voltage = req.measurements.MainL1Voltage / 10; }
    if (Object.keys(req.measurements).includes("MainL2Voltage")) { req.measurements.MainL2Voltage = req.measurements.MainL2Voltage / 10; }
    if (Object.keys(req.measurements).includes("MainL3Voltage")) { req.measurements.MainL3Voltage = req.measurements.MainL3Voltage / 10; }
    if (Object.keys(req.measurements).includes("EngineBatteryVoltage")) { req.measurements.EngineBatteryVoltage = req.measurements.EngineBatteryVoltage / 10; }
    if (Object.keys(req.measurements).includes("EngineRunTime")) { req.measurements.EngineRunTime = Math.round(req.measurements.EngineRunTime / 3600); }
    if (Object.keys(req.measurements).includes("ChargeAltVoltage")) { req.measurements.ChargeAltVoltage = req.measurements.ChargeAltVoltage / 10; }
    if (Object.keys(req.measurements).includes("GeneratorFrequency")) { req.measurements.GeneratorFrequency = req.measurements.GeneratorFrequency / 10; }
    if (Object.keys(req.measurements).includes("GenL1Voltage")) { req.measurements.GenL1Voltage = req.measurements.GenL1Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL2Voltage")) { req.measurements.GenL2Voltage = req.measurements.GenL2Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL3Voltage")) { req.measurements.GenL3Voltage = req.measurements.GenL3Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL1Current")) { req.measurements.GenL1Current = req.measurements.GenL1Current / 10; }
    if (Object.keys(req.measurements).includes("GenL2Current")) { req.measurements.GenL2Current = req.measurements.GenL2Current / 10; }
    if (Object.keys(req.measurements).includes("GenL3Current")) { req.measurements.GenL3Current = req.measurements.GenL3Current / 10; }
    return req;
}
function scale6120(req) {
    if (Object.keys(req.measurements).includes("EngineRunTime")) { req.measurements.EngineRunTime = Math.round(req.measurements.EngineRunTime / 3600); }
    if (Object.keys(req.measurements).includes("ChargeAltVoltage")) { req.measurements.ChargeAltVoltage = req.measurements.ChargeAltVoltage / 10; }
    if (Object.keys(req.measurements).includes("GeneratorFrequency")) { req.measurements.GeneratorFrequency = req.measurements.GeneratorFrequency / 10; }
    if (Object.keys(req.measurements).includes("GenL1Voltage")) { req.measurements.GenL1Voltage = req.measurements.GenL1Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL2Voltage")) { req.measurements.GenL2Voltage = req.measurements.GenL2Voltage / 10; }
    if (Object.keys(req.measurements).includes("GenL3Voltage")) { req.measurements.GenL3Voltage = req.measurements.GenL3Voltage / 10; }

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
