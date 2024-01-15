const config = {port: 9091};

Object.freeze(config); // Config should not be modified after initialization!

const MessageParser = function(webSocket, message, isBinary) {
	if(isBinary) {
		console.log("%s client exiting, reason: Unsupported transport", new TextDecoder("utf-8").decode(webSocket.getRemoteAddressAsText()));
		webSocket.end(1003, new TextEncoder("utf-8").encode("Sorry, but we currently do not support binary transport. Check back later!"));
		return;
	}
	const msg = (isBinary ? message : new TextDecoder("utf-8").decode(message));
	//console.log(msg, message, isBinary);
	console.log(`${new TextDecoder("utf-8").decode(webSocket.getRemoteAddressAsText())} message: ${msg}`);
}

const UserStateRequest = function(webSocket, state, data = null) {
	switch(state) {
		case "open": {
			// allow client to subscribe to any room
			// webSocket.subscribe("rooms/#");
			console.log("%s client hello", new TextDecoder("utf-8").decode(webSocket.getRemoteAddressAsText()));
			break;
		}
		case "close": {
			// close event gets WS disconnect code and the client's termination message (avaliable if data.code is 1000, 3xxx, or 4xxx, but only 1000 is standard)
			// but we DO NOT get to access any WS methods, since they've been closed, so we don't actually know who left.
			if(data.code === 1000) {
				console.log(`client exiting, reason: ${new TextDecoder("utf-8").decode(data.message)}`);
			}
			break;
		}
	}
}

// use SSLApp in prod!... or just proxy in nginx (apache2 is """fine""" too), does it matter in the end?
require("uWebSockets.js").App({}).ws('/*', {
	"idleTimeout": 32,
	"maxBackpressure": 1024,
	"maxPayloadLength": 512,
	"compression": require("uWebSockets.js").DEDICATED_COMPRESSOR_3KB,
	// here be events
	"message": MessageParser,
	"open": function(ws) {UserStateRequest(ws, "open")},
	"close": function(ws, code, message) {UserStateRequest(ws, "close", {code, message})},
	"drain": function(ws) {console.log(`WS going through back-pressure!: ${ws.getBufferedAmount()}`)}
}).listen(config.port, function(token) {console.log(token ? `open on ${config.port}` : `failed to listen to ${config.port}`)});