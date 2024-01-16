const config = {port: 9091};
Object.freeze(config); // Config should not be modified after initialization!

const RoomStorage = new Map();

const ParseCommandString = function(instruction) {
	if(typeof instr !== "string") {
		return;
	}
	let position = -1;
	let sections = new Array();
	
	for(;;) {
		let length = instruction.indexOf('.', pos + 1);
		
		if(length === -1) {
			break;
		}
		
		position = (parseInt(instruction.slice(position + 1, length)) + length) + 1
		sections.push(instruction.slice(length + 1, position));
		
		if(instruction.slice(position, position + 1) === ';') {
			break;
		}
	}
	return sections;
}
const EncodeCommandString = function(args) {
	if(Array.isArray(args) === false) {
		return;
	}
	let output = ""
	const argsArray = args;
	for (let argv = 0; argv < args.length ; argv++) {
		if(typeof args[argv] !== "string") {
			argsArray[argv] = args[argv].toString();
		}
		output = output.concat(argsArray[argv].length.toString(), ".", argsArray[argv])
		output += (argv === args.length - 1) ? ";" : ",";
	}
	return output;
}
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
	console.log(`${request.getMethod().toUpperCase()} ${request.getUrl()}`);
	switch(request.getMethod()) {
		case "post": {
			// create a room
			response.onAborted(function(){}); // could probably write some 4xx here but oh well
			if(request.getHeader("content-type") !== "application/json") {
				response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Expected JSON.\"}");
				return;
			}
			response.onData(function(chunk, last) {
				if(last !== true) {
					response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Request too long.\"}");
					return;
				}
				let timeData = JSON.parse(new TextDecoder("utf-8").decode(chunk));
				let id = Math.random().toString(16).split('.')[1].substring(0,8);
				RoomStorage.set(id, timeData);
				response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${id}"}`);
				console.log(`${id} => ${JSON.stringify(timeData)}`);
				return;
			});
			return;
		}
		case "get": {
			// get room information
			let getRoomId = request.getUrl().split('/')[2];
			if(typeof RoomStorage.get(getRoomId) === "undefined") {
				response.writeStatus("404 Not Found").writeHeader("Content-Type", "application/json").end(`{"status": "error", "message": "Room doesn't exist."}`);
				return;
			};
			response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${getRoomId}"}`);
			return;
		}
		case "put": {
			// modify a room
			// TODO: authenticate!
			response.onAborted(function(){}); // could probably write some 4xx here but oh well
			let getRoomId = request.getUrl().split('/')[2];
			if(typeof RoomStorage.get(getRoomId) === "undefined") {
				response.writeStatus("404 Not Found").writeHeader("Content-Type", "application/json").end(`{"status": "error", "message": "Room doesn't exist."}`);
				return;
			};
			if(request.getHeader("content-type") !== "application/json") {
				response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Expected JSON.\"}");
				return;
			}
			response.onData(function(chunk, last) {
				if(last !== true) {
					response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Request too long.\"}");
					return;
				}
				let timeData = JSON.parse(new TextDecoder("utf-8").decode(chunk));
				RoomStorage.set(getRoomId, timeData);
				response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${getRoomId}"}`);
				console.log(`${getRoomId} => ${JSON.stringify(timeData)}`);
				return;
			});
			return;
		}
		case "delete": {
			// terminate a room
			// TODO: authenticate!
			let getRoomId = request.getUrl().split('/')[2];
			if(typeof RoomStorage.get(getRoomId) === "undefined") {
				response.writeStatus("404 Not Found").writeHeader("Content-Type", "application/json").end(`{"status": "error", "message": "Room doesn't exist."}`);
				return;
			};
			RoomStorage.delete(getRoomId);
			response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${getRoomId}"}`);
			return;
		}
	}
}

// use SSLApp in prod!... or just proxy in nginx (apache2 is """fine""" too), does it matter in the end?
require("uWebSockets.js").App({})
.ws("/room/*", { // DECIDE ON THE ENDPOINT FOR WS ADDRESS; could also be /room/id, but would require jank? in USR(open)
	"idleTimeout": 32,
	"maxBackpressure": 1024,
	"maxPayloadLength": 512,
	"compression": require("uWebSockets.js").DEDICATED_COMPRESSOR_3KB, // do we need a compressor for this kind of protocol, uWS actively despises compression, so it's worth considering.
	// here be events
	"message": MessageParser,
	"open": function(ws) {UserStateRequest(ws, "open")},
	"close": function(ws, code, message) {UserStateRequest(ws, "close", {code, message})},
	"drain": function(ws) {console.log(`WS going through back-pressure!: ${ws.getBufferedAmount()}`)}
})
.put("/room/*", HttpRequestHandler)
.del("/room/*", HttpRequestHandler)
.get("/room/*", HttpRequestHandler) // should this really even provide anything or should it be handled by a frontend server
.get("/", function(rs,rq) {
	rs.writeStatus("200 OK").end(/* template starts here: */
`<!doctype html>
<html>
	<head>
		<title>timeshare over websocket</title>
	</head>
	<body>
		<form action="create-room" id="room-creator">
			<label for="primaryTime">A</label>
			<input type="number" id="primaryTime" name="primaryTime" min="1" value="1">
			<label for="breakTime">B</label>
			<input type="number" id="breakTime" name="breakTime" min="1" value="1">
			<label for="messagesEnabled">C</label>
			<input type="checkbox" id="messagesEnabled" name="messagesEnabled">
			<input value="Submit" type="button" id="faux-submit">
		</form>
	</body>
	<script>
		document.getElementById("faux-submit").onclick = function(e) {
			let sentData = new Object();
			sentData.primaryTime = parseInt(document.getElementById("primaryTime").value);
			sentData.breakTime = parseInt(document.getElementById("breakTime").value);
			sentData.messagesEnabled = document.getElementById("messagesEnabled").checked;
			fetch("/create-room", {"method": "POST", "headers": {"Content-Type": "application/json"}, "body": JSON.stringify(sentData)});
		}
	</script>
</html>`);
})
.post("/create-room", HttpRequestHandler) // is this final naming? endpoint naming/routing can be decided later if needed
.listen(config.port, function(token) {console.log(token ? `open on ${config.port}` : `failed to listen to ${config.port}`)});