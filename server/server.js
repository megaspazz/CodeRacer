var path = require("path");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

const PORT = 1997;

const CLIENT_PATH = path.resolve(__dirname + "/../client");

var activeRaces = { };

app.use("/css",  express.static(CLIENT_PATH + "/css"));
app.use("/js",  express.static(CLIENT_PATH + "/js"));
app.use("/assets",  express.static(CLIENT_PATH + "/assets"));

app.get('/', function(req, res) {
	res.sendFile(CLIENT_PATH + "/index.html");
});

http.listen(PORT, function() {
	console.log("starting server on *:" + PORT);
});





io.on("connection", function(socket) {
	console.log("+ CONNECTION");

	socket.on("race_request", function(userID) {
		console.log("got race request");
		let raceID = 1997;
		let raceText = "lorem ipsum\nherp derp";
		if (!activeRaces[raceID]) {
			activeRaces[raceID] = {
				users: { },
				startTime: null
			};
		}		
		activeRaces[raceID].users[userID] = {
			name: userID,    // make this the actual display name
			connection: socket,
			progress: null
		}
		console.log(Object.keys(activeRaces[raceID].users).length);
		if (Object.keys(activeRaces[raceID].users).length >= 2) {
			if (!activeRaces[raceID].startTime) {
				let time = new Date();
				time.setSeconds(time.getSeconds() + 5);
				activeRaces[raceID].startTime = time;
			}
			
			let usersInRace = [];
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				usersInRace.push(user.name);
			}
			let usersInRaceJSON = JSON.stringify(usersInRace);
			
			let actualStartTime = activeRaces[raceID].startTime;
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				user.connection.emit("start_race_timer", actualStartTime, usersInRaceJSON);
			}
		}
		//activeRaces[raceID].users[userID] = null;
		//activeRaces[raceID].started = true;
		socket.emit("found_race", raceID, raceText);
	});
	
	socket.on("progress_report", function(raceID, userID, progress) {
		console.log("got progress report");
		activeRaces[raceID].users[userID].progress = progress;
		console.log("didn't die yet");
		let userProgresses = { };
		for (let userID in activeRaces[raceID].users) {
			userProgresses[userID] = activeRaces[raceID].users[userID].progress;
		}
		let userProgressesJSON = JSON.stringify(userProgresses);
		socket.emit("race_state", raceID, userProgressesJSON);
	});

	socket.on("disconnect", function() {
		console.log("- DISCONNECTION");
	});
	
	
	
	
	
	socket.on("test request", function() {
		console.log("  * GOT REQUEST!");
		socket.emit("test receive", "lorem ipsum herp derp");
	});
});
