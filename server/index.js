const config = {port: 9091};
Object.freeze(config); // Config should not be modified after initialization!

const RoomStorage = new Map();

const ParseCommandString = function(instruction) {
	if(typeof instruction !== "string") {
		return;
	}
	let position = -1;
	let sections = new Array();

	for(;;) {
		let length = instruction.indexOf('.', position + 1);

		if(length === -1) {
			break;
		}

		position = (parseInt(instruction.slice(position + 1, length)) + length) + 1
		sections.push(instruction.slice(length + 1, position)
			.replace(/&#x27;/g,	"'")
			.replace(/&quot;/g,	'"')
			.replace(/&#x2F;/g,	'/')
			.replace(/&lt;/g,	'<')
			.replace(/&gt;/g,	'>')
			.replace(/&amp;/g,	'&')
		);

		if(instruction.slice(position, position + 1) === ';') {
			break;
		}
	}
	return sections;
}
const EncodeCommandString = function(sections) {
	if(Array.isArray(sections) === false) {
		return;
	}
	let instruction = new String();
	const argv = sections;
	for (let argc = 0; argc < sections.length ; argc++) {
		if(typeof sections[argc] !== "string") {
			argv[argc] = sections[argc].toString();
		}
		argv[argc] = argv[argc]
			.replace(/'/g,	"&#x27;")
			.replace(/"/g,	'&quot;')
			.replace(/\//g,	'&#x2F'	)
			.replace(/</g,	'&lt;'	)
			.replace(/>/g,	'&gt;'	)
			.replace(/&/g,	'&amp;'	)
		;
		instruction = instruction.concat(argv[argc].length.toString(), ".", argv[argc])
		instruction += (argc === sections.length - 1) ? ';' : ',';
	}
	return instruction;
}
const MessageParser = function(webSocket, message, isBinary) {
	if(isBinary) {
		console.log("%s client exiting, reason: Unsupported binary", new TextDecoder("utf-8").decode(webSocket.getRemoteAddressAsText()));
		webSocket.end(1003, new TextEncoder("utf-8").encode("Sorry, but we currently do not support binary transport. Check back later!"));
		return;
	}
	const msg = (isBinary ? message : new TextDecoder("utf-8").decode(message));
	try {
		const args = ParseCommandString(msg);
		switch(args[0]) {
			case "name": {
				webSocket.send(EncodeCommandString(["rename", 0, "", webSocket.getUserData().username]));
				break;
			}
			case "join": {
				if(args.length <= 1) {
					webSocket.send(EncodeCommandString(["join", 0]));
					break;
				}
				let getRoomId = args[1];
				if(typeof RoomStorage.get(getRoomId) === "undefined") {
					webSocket.send(EncodeCommandString(["join", 0]));
					break;
				};
				if(webSocket.isSubscribed(`rooms/${getRoomId}`) === true) {
					webSocket.send(EncodeCommandString(["join", 0]));
					webSocket.send(EncodeCommandString(["msg", `You are already in the room ${getRoomId}.`]));
					break;
				};
				//									param   s
				webSocket.send(EncodeCommandString(["join", 1,
					RoomStorage.get(getRoomId)["primaryTime"],		/* primary time */
					RoomStorage.get(getRoomId)["breakTime"],		/* break time */
					RoomStorage.get(getRoomId)["messagesEnabled"]|0	/* messagesEnabled as int */
				]));
				webSocket.subscribe(`rooms/${getRoomId}`);
				webSocket.send(EncodeCommandString(["msg", `Joined the room ${getRoomId}.`]));
				webSocket.send(EncodeCommandString(["adduser", getRoomId, 1, webSocket.getUserData().username])); // this should send all current users
				webSocket.publish(`rooms/${getRoomId}`, EncodeCommandString(["adduser", getRoomId, 1, webSocket.getUserData().username]));
				break;
			}
			case "part": {
				if(args.length <= 1) {
					webSocket.send(EncodeCommandString(["part", 0]));
					break;
				}
				let getRoomId = args[1];
				if(typeof RoomStorage.get(getRoomId) === "undefined") {
					webSocket.send(EncodeCommandString(["part", 0]));
					break;
				};
				if(webSocket.isSubscribed(`rooms/${getRoomId}`) === false) {
					webSocket.send(EncodeCommandString(["part", 0]));
					break;
				};
				webSocket.send(EncodeCommandString(["part", 1]));
				webSocket.unsubscribe(`rooms/${getRoomId}`);
				webSocket.send(EncodeCommandString(["msg", `Parted the room ${getRoomId}.`]));
				webSocket.publish(`rooms/${getRoomId}`, EncodeCommandString(["remuser", getRoomId, webSocket.getUserData().username]));
				break;
			}
			case "chat": {
				if(args.length <= 2) {
					break;
				}
				let getRoomId = args[1];
				if(typeof RoomStorage.get(getRoomId) === "undefined") {
					break;
				};
				if(RoomStorage.get(getRoomId)["messagesEnabled"] === false) {
					break;
				}
				if(webSocket.isSubscribed(`rooms/${getRoomId}`) === false) {
					break;
				};
				webSocket.send(EncodeCommandString(["chat", getRoomId, webSocket.getUserData().username, args[2]]));
				webSocket.publish(`rooms/${getRoomId}`, EncodeCommandString(["chat", getRoomId, webSocket.getUserData().username, args[2]]));
				break;
			}
			case "disconnect": {
				webSocket.send(EncodeCommandString(["disconnect"]));
				webSocket.end(1000, "Sent \"disconnect\" command.");
				return;
			}
			default: {
				console.log("unknown command", args);
			}
		}
	} catch(e) {
		console.log(e);
		webSocket.end(1003, new TextEncoder("utf-8").encode("Unknown format."));
		return;
	}
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
	console.log(`${new TextDecoder("utf-8").decode(response.getRemoteAddressAsText())} ${request.getMethod().toUpperCase()} ${request.getUrl()}`);
	switch(request.getMethod()) {
		case "post": {
			// create a room
			response.onAborted(function(){}); // could probably write some 4xx here but oh well
			if(request.getHeader("content-type") !== "application/json") {
				response.cork(function() {response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Expected JSON.\"}")});
				return;
			}
			response.onData(function(chunk, last) {
				if(last !== true) {
					response.cork(function() {response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Request too long.\"}")});
					return;
				}
				let timeData = JSON.parse(new TextDecoder("utf-8").decode(chunk));
				let id = Math.random().toString(16).split('.')[1].substring(0,8);
				RoomStorage.set(id, timeData);
				response.cork(function() {response.writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${id}"}`)});
				console.log(`${id} => ${JSON.stringify(timeData)}`);
				return;
			});
			return;
		}
		case "get": {
			// get room information
			let getRoomId = request.getParameter("room");
			if(typeof RoomStorage.get(getRoomId) === "undefined") {
				response.cork(function() {response.writeStatus("404 Not Found").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Room doesn't exist.\"}")});
				return;
			};
			response.cork(function() {response.writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${getRoomId}"}`)});
			return;
		}
		case "put": {
			// modify a room
			// TODO: authenticate!
			response.onAborted(function(){}); // could probably write some 4xx here but oh well
			let getRoomId = request.getParameter("room");
			if(typeof RoomStorage.get(getRoomId) === "undefined") {
				response.cork(function() {response.writeStatus("404 Not Found").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Room doesn't exist.\"}")});
				return;
			};
			if(request.getHeader("content-type") !== "application/json") {
				response.cork(function() {response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Expected JSON.\"}")});
				return;
			}
			response.onData(function(chunk, last) {
				if(last !== true) {
					response.cork(function() {response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Request too long.\"}")});
					return;
				}
				let timeData = JSON.parse(new TextDecoder("utf-8").decode(chunk));
				RoomStorage.set(getRoomId, timeData);
				response.cork(function() {response.writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${getRoomId}"}`)});
				console.log(`${getRoomId} => ${JSON.stringify(timeData)}`);
				return;
			});
			return;
		}
		case "delete": {
			// terminate a room
			// TODO: authenticate!
			let getRoomId = request.getParameter("room");
			if(typeof RoomStorage.get(getRoomId) === "undefined") {
				response.cork(function() {response.writeStatus("404 Not Found").writeHeader("Content-Type", "application/json").end("{\"status\": \"error\", \"message\":\"Room doesn't exist.\"}")});
				return;
			};
			RoomStorage.delete(getRoomId);
			console.log(`${getRoomId} => (deleted from registry)`);
			response.cork(function() {response.writeHeader("Content-Type", "application/json").end(`{"status": "success", "room": "${getRoomId}"}`)});
			return;
		}
	}
}

// use SSLApp in prod!... or just proxy in nginx (apache2 is """fine""" too), does it matter in the end?
const server = require("uWebSockets.js").App({}); // i need this for global .publish (server.publish(id, ECS(["event", 1]); later, i think?
server.ws("/connect", {
	// options
	"compression": require("uWebSockets.js").DEDICATED_COMPRESSOR_3KB, // do we need a compressor for this kind of protocol, uWS actively despises compression, so it's worth considering.
	// here be events
	"upgrade": function(rs, rq, cx) {
		rs.upgrade({"username": Math.random().toString(36).split('.')[1].substring(0,8)}, /* very important, this sets a UserData object (which can contain anything we like) to the WSConnection instance. This can only be done here. */
		rq.getHeader("sec-websocket-key"),
		rq.getHeader("sec-websocket-protocol"),
		rq.getHeader("sec-websocket-extensions"),
		cx);
	},
	"message": MessageParser,
	"open": function(ws) {UserStateRequest(ws, "open")},
	"close": function(ws, code, message) {UserStateRequest(ws, "close", {code, message})},
	"drain": function(ws) {console.log(`WS going through back-pressure!: ${ws.getBufferedAmount()}`)}
})
.put("/room/:room", HttpRequestHandler)
.del("/room/:room", HttpRequestHandler)
.get("/room/:room", HttpRequestHandler) // should this really even provide anything or should it be handled by a frontend server
.get("/", function(rs,rq) {
	rs.writeHeader("Content-Type", "text/html").end(/* template starts here: */
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
</html>`
	);
})
.post("/create-room", HttpRequestHandler) // is this final naming? endpoint naming/routing can be decided later if needed
.listen(config.port, function(token) {console.log(token ? `open on ${config.port}` : `failed to listen to ${config.port}`)});

// i keep considering if i should make this a HTMX thing or not

//current issues:
/**
	Can't decide on client-side rewrite already
	What starts the clock? Does it start on room creation?
	If we're doing it by HttpRequestHandler, then how do we start it?
	Should we support partial edits using the PATCH verb?
	If not, then what?

	Authenication: How? Room creation token?

	Rooms with 0 members: what do we do about them?, delete after a timeout?
**/