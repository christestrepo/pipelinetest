/*
* This function is not intended to be invoked directly. Instead it will be
* triggered by a client function.
* 
* Before running this sample, please:
* - create a Durable entity HTTP function
* - run 'npm install durable-functions' from the root of your app
*/


const df = require("durable-functions");

module.exports = df.entity(function (context) {
    const currentValue = context.df.getState()??{};
    let model = "";
    let device = "";
    let telemetry = "";
    let jsonval = {};
    let input = "";
    switch (context.df.operationName) {
        case "addModel":
            model = context.df.getInput();
            context.log("Adding Model: "+model);
            currentValue[model] ={};
            context.df.setState(currentValue);
            break;
        case "addDevice":
            input = context.df.getInput();
            model = input.split("~")[0]; 
            device = input.split("~")[1]; 
            context.log("Add device to model: "+input);
            jsonval=currentValue;
            jsonval[model][device] = {};
            context.df.setState(jsonval);
            break;
        case "setStates":
            input = context.df.getInput();
            model = input.split("~")[0]; 
            device = input.split("~")[1];
            telemetry = input.split("~")[2];
            jsonval=currentValue;            
            context.log("[Updating state] " +JSON.stringify(currentValue) + "\n => \n"+telemetry);
            jsonval[model][device] = JSON.parse(telemetry);
            context.df.setState(jsonval);
            break;
        case "clear":
            context.df.setState({});
            break;
        case "get":
            context.df.return(currentValue);
            break;
    }
});