var path = require("path");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

// filesystem
var fs = require("fs");

const UserStates = {
	NONE: 0,
	STARTED: 1,
	FINISHED: 2,
	QUIT: 3
}

const PRE_RACE_TIME = 10000;

const PORT = 1997;

const CLIENT_PATH = path.resolve(__dirname + "/../client");

const RACE_TEXTS_PATH = __dirname + "/race_texts";

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




function getUserProgresses(raceID) {
	let userProgresses = { };
	for (let userID in activeRaces[raceID].users) {
		userProgresses[userID] = activeRaces[raceID].users[userID].progress;
	}
	return userProgresses;
}

function getStartRaceFunction(sock) {
	return function() {
		sock.emit("start_race");
	}
}

function checkRaceCompleted(raceID) {
	let done = true;
	for (let id in activeRaces[raceID].users) {
		let userState = activeRaces[raceID].users[id].state;
		if (userState === UserStates.NONE || userState === UserStates.STARTED) {
			done = false;
			break;
		}
	}
	if (done) {
		// robon saves match into history table
		console.log("*** " + raceID + " ALL DONE ***");
		for (let id in activeRaces[raceID].users) {
			let user = activeRaces[raceID].users[id];
			let userProgresses = getUserProgresses(raceID);
			user.connection.emit("race_all_done", raceID, userProgresses);
		}
		delete activeRaces[raceID];
	}
}


io.on("connection", function(socket) {
	console.log("+ CONNECTION");

	socket.on("race_request", function(raceID, userID) {
		console.log("got race request");



		//let raceText = "lorem ipsum\nherp derp";
		// let raceText = fs.readFileSync(__dirname + "/race_texts/sum.js", "utf8");

		if (!activeRaces[raceID]) {
			// actually get a random race text
			let fileNames = fs.readdirSync(RACE_TEXTS_PATH);
			let fileNum = ~~(Math.random() * fileNames.length);
			let fullFilePath = path.join(RACE_TEXTS_PATH, fileNames[fileNum]);
			let codeText = fs.readFileSync(fullFilePath, "utf8");

			console.log(fileNames);
			console.log(fileNames[fileNum]);
			console.log(codeText);

			activeRaces[raceID] = {
				users: { },
				startTime: null,
				codeFile: fileNames[fileNum],
				raceText: codeText
			};
		}

		socket.emit("found_race", raceID, activeRaces[raceID].raceText);
		activeRaces[raceID].users[userID] = {
			name: userID,    // make this the actual display name
			connection: socket,
			progress: null,
			state: UserStates.NONE,
			finishTime: NaN
		}
		console.log(Object.keys(activeRaces[raceID].users).length);
		if (Object.keys(activeRaces[raceID].users).length >= 2) {
			if (!activeRaces[raceID].startTime) {
				let now = Date.now();
				var time = now + PRE_RACE_TIME;
				activeRaces[raceID].startTime = time;
			}
			
			let usersInRace = [];
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				usersInRace.push(user.name);
			}
			
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				if (user.state === UserStates.NONE) {
					user.started = UserStates.STARTED;
					let now = Date.now();
					let remainingTime = Math.max(0, activeRaces[raceID].startTime - now);
					let startRaceFn = getStartRaceFunction(user.connection);
					setTimeout(startRaceFn, remainingTime);
					console.log("remaining time = " + remainingTime);
					user.connection.emit("start_race_timer", remainingTime, usersInRace);
				}
			}
		}
	});
	
	socket.on("progress_report", function(raceID, userID, progress) {
		console.log("got progress report from " + userID);
		if (!activeRaces[raceID]) {
			console.log("warning: report for dead race.");
			return;
		}

		activeRaces[raceID].users[userID].progress = progress;
		let userProgresses = getUserProgresses(raceID);
		socket.emit("race_state", raceID, userProgresses);
	});

	socket.on("disconnect", function() {
		console.log("- DISCONNECTION");
	});
	
	socket.on("quit_race", function(raceID, userID) {
		if (activeRaces[raceID]) {
			let user = activeRaces[raceID].users[userID];
			if (!user.finishTime) {
				// if the user didn't finish the race we should record it in the stats
				user.state = UserStates.QUIT;
				user.connection.emit("after_quit_race");
				checkRaceCompleted(raceID);
			}
		} else {
			console.log("warning: tried to quit a nonexistent race!");
		}
	});
	
	socket.on("race_finished", function(raceID, userID) {
		console.log("race finished");
		let now = Date.now();
		let duration = now - activeRaces[raceID].startTime;
		activeRaces[raceID].users[userID].finishTime = duration;
		activeRaces[raceID].users[userID].progress.currentLine = activeRaces[raceID].users[userID].progress.totalLines;
		activeRaces[raceID].users[userID].state = UserStates.FINISHED;
		console.log("!!! " + userID + " FINISHED !!!");
		// robon does individual user statistics
		//
		//
		checkRaceCompleted(raceID);
	});
	
	
	
	
	socket.on("test request", function() {
		console.log("  * GOT REQUEST!");
		socket.emit("test receive", "lorem ipsum herp derp");
	});
});
