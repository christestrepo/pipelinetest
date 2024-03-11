const fetch = require('node-fetch');
const df = require("durable-functions");
const https = require('https');



module.exports = async function (context, myTimer) {
    //return; //Dont run for prods
    var testVar;
    var testVar2;
    var request = [];
    var hasOffline = false;
    var httpoptions = {
        host: 'prod-46.northeurope.logic.azure.com',
        port: '443',
        path: '/workflows/4fd455e5f0314d4bab71ba8d9fb2a9b0/triggers/manual/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=zNILdKQMYcHQ8xuoQ57jUwgLkbO7u029M5WHHhf4onc',
        method: 'POST',
        headers: {
            "Content-Type": 'plain/text'
        }
    };

    // ENTITY Access
    const client = df.getClient(context);
    const entityId = new df.EntityId("Entity", "myTelemetry");
    const stateResponse = await client.readEntityState(entityId);
    let curState = stateResponse.entityState ?? {};
    context.log(curState);

    Object.keys(curState).forEach((model) => {
        if (model == 'DSE890DEVICE') { return; } //Skip duplicate devices for DSE (Include all other potential duplicates)

        //Loop through all devices for this controller
        Object.keys(curState[model]).forEach((device) => {
            let obj = curState[model][device]; //Get device object from entity
            context.log("[EVALUATION] " + model + " : " + device + " : " + obj.ModelId);
            if (!obj.ModelId) { context.log("[SKIP] No model Id found"); return; }//If Device has not sent data since this update or never sent data skip

            let time = obj.ReadingOn ?? 0;
            context.log("Last received "+new Date(time)+" , current time "+new Date(Date.now()));
            if ((Date.now() - time) > 600000) {//5400000) {
                hasOffline = true;
                request.push(device+"|"+new Date(time));//request.push('Device ' + device + ' is Offline since ' + new Date(time));
            }
            context.log("[END EVALUATION]");
        });
    });
    if (!hasOffline) { context.log("[NO OFFLINE FOUND]"); request.push("None");} // Don't send to logic app if none offline
    
    // Set up the request
    var req = https.request(httpoptions, (res) => {
        var body = "";
        context.log("[" + res.statusCode + "] " + res.statusMessage);

        res.on("data", (chunk) => {
            body += chunk;
        });

        res.on("end", () => {
            context.log(body);
        });

    }).on("error", (error) => {
        context.log("[ERROR]");
        context.log(error);
    });
    //req.end();
    req.end(JSON.stringify(request));
};

function voidFunc(){
    return 'nothing';
}
