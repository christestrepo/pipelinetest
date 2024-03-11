/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fetch = require('node-fetch');
const handleMessage = require('./lib/engine');
const df = require("durable-functions");

const msiEndpoint = process.env.MSI_ENDPOINT;
const msiSecret = process.env.MSI_SECRET;
const Token = process.env.Token;

const parameters = {
    idScope: process.env.ID_SCOPE,
    primaryKeyUrl: process.env.IOTC_KEY_URL
};

let kvToken;

module.exports = async function (context, req) {
    context.log(req.body);

    //Authenticate token
    let auth = await authenticateRequest(context, req);
    if (auth.statusCode != 200) {
        context.log('[ERROR]', auth.message);

        context.res =
        {
            status: auth.statusCode,
            body: auth.message
        };
        return;
    }

    // Get previous values
    const client = df.getClient(context);
    const entityId = new df.EntityId("Entity", "PrevTelemetry");
    const stateResponse = await client.readEntityState(entityId);
    let curState = stateResponse.entityState ?? {};
    context.log(curState);

    //DELETE AND EXIST FOR HARD RESET
    //client.signalEntity(entityId, "clear");
    //return;

    //Set variables
    let exportData = false;
    let controllerModel = req.headers.model;
    let prevValues = { "Volume_KL": 0, "PrevFlowVolume": 0, "PrevFlowTime": 0 };

    // CREATE MODEL DEVICE IF IT DOES NOT EXIST
    if (curState[controllerModel]) {
        if (curState[controllerModel][req.body.device.deviceId]) {
            prevValues = curState[controllerModel][req.body.device.deviceId];
        }
        else {
            context.log("Device Added");
            client.signalEntity(entityId, "addDevice", controllerModel + "~" + req.body.device.deviceId);
        }
    } else {
        context.log("Model Added");
        client.signalEntity(entityId, "addModel", controllerModel);
        client.signalEntity(entityId, "addDevice", controllerModel + "~" + req.body.device.deviceId);
    }

    context.log(prevValues);
    switch (controllerModel) {
        case 'Meter':
            if (req.body.measurements.Volume_KL >= (prevValues.Volume_KL??0) + 0.01 && (prevValues.PrevFlowVolume??0) != 0) {
                exportData = true;
                req.body.measurements.FlowRate = Math.round(((req.body.measurements.Volume_KL - prevValues.PrevFlowVolume) * 1000 / (Date.now() / 1000 - prevValues.PrevFlowTime)) * 1000) / 1000;
                prevValues.Volume_KL = req.body.measurements.Volume_KL;
            }
            prevValues.PrevFlowTime = Date.now() / 1000;
            prevValues.PrevFlowVolume = req.body.measurements.Volume_KL;
            break;
        case 'Environment':
            if (req.body.measurements.Temperature && (prevValues.Temperature??0) != req.body.measurements.Temperature) {
                exportData = true;
                prevValues.Temperature = req.body.measurements.Temperature;
            }
            if(req.body.measurements.WaterLeak && (prevValues.WaterLeak??0) != req.body.measurements.WaterLeak){
                exportData = true;
                prevValues.WaterLeak = req.body.measurements.WaterLeak;
            }
            if(req.body.measurements.Humidity && (prevValues.Humidity??0) != req.body.measurements.Humidity){
                exportData = true;
                prevValues.Humidity = req.body.measurements.Humidity;
            }
            break;
        default:
    }
    client.signalEntity(entityId, "setStates", controllerModel + "~" + req.body.device.deviceId + "~" + JSON.stringify(prevValues));

    context.log(prevValues);

    if (exportData) {
        //Send request
        context.log('[INFO] Export req: ' + JSON.stringify(req.body));
        try {
            await handleMessage({ ...parameters, log: context.log, getSecret: getKeyVaultSecret }, req.body.device, req.body.measurements, req.body.timestamp);
        } catch (e) {
            context.log('[ERROR]', e.message);

            context.res = {
                status: e.statusCode ? e.statusCode : 500,
                body: e.message
            };
        }
        return;
    }
    context.log('[INFO] No changes to export.');
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

async function authenticateRequest(context, req) {
    var authResponse = { statusCode: 401, message: 'Unauthorized' };
    try {
        if (req.headers.token == Token) {
            authResponse.statusCode = 200;
            authResponse.message = 'Authenticated successfully';
        }
    } catch (e) {
        authResponse.statusCode = 400;
        authResponse.message = 'Invalid request';
    }
    return authResponse;
}