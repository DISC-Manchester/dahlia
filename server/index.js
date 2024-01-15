const config = {port: 9091};

Object.freeze(config); // Config should not be modified after initialization!

const MessageParser = function(webSocket, message, isBinary) {
	if(isBinary) {
		console.log("%s client exiting, reason: Unsupported binary", new TextDecoder("utf-8").decode(webSocket.getRemoteAddressAsText()));
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
const HttpRequestHandler = function(response, request) {
	console.log(`${request.getMethod().toUpperCase()} ${request.getUrl()}`)
	switch(request.getMethod()) {
		case "get": {
			// connect to a room
			break;
		}
		case "put": {
			// modify a room
			break;
		}
		case "post": {
			// create a room
			break;
		}
		case "delete": {
			// terminate a room
			break;
		}
	}
	response.writeStatus('200 OK').end("No data.");
}

// use SSLApp in prod!... or just proxy in nginx (apache2 is """fine""" too), does it matter in the end?
require("uWebSockets.js").App({})
.ws('/room/*', { // DECIDE ON THE ENDPOINT FOR WS ADDRESS; could also be /room/id, but would require jank? in USR(open)
	"idleTimeout": 32,
	"maxBackpressure": 1024,
	"maxPayloadLength": 512,
	"compression": require("uWebSockets.js").DEDICATED_COMPRESSOR_3KB,
	// here be events
	"message": MessageParser,
	"open": function(ws) {UserStateRequest(ws, "open")},
	"close": function(ws, code, message) {UserStateRequest(ws, "close", {code, message})},
	"drain": function(ws) {console.log(`WS going through back-pressure!: ${ws.getBufferedAmount()}`)}
})
.put('/room/*', HttpRequestHandler)
.del('/room/*', HttpRequestHandler)
.get('/room/*', HttpRequestHandler) // should this really even provide anything or should it be handled by a frontend server
.post('/create-room', HttpRequestHandler) // is this final naming? endpoint naming/routing can be decided later if needed
.listen(config.port, function(token) {console.log(token ? `open on ${config.port}` : `failed to listen to ${config.port}`)});