var path = require("path");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

// filesystem
var fs = require("fs");

const UserStates = {
	NONE: 0,
	STARTING: 1,
	STARTED: 2,
	FINISHED: 3,
	QUIT: 4
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

function getStartRaceFunction(raceID, userID) {
	return function() {
		if (activeRaces[raceID]) {
			let user = activeRaces[raceID].users[userID];
			if (user.state === UserStates.STARTING) {
				user.state = UserStates.STARTED;
				user.connection.emit("start_race");
			}
		}
	}
}

function checkRaceCompleted(raceID) {
	let done = true;
	for (let id in activeRaces[raceID].users) {
		let userState = activeRaces[raceID].users[id].state;
		// is might be better to say that it's not FINISHED or QUIT
		if (userState === UserStates.NONE || userState === UserStates.STARTING || userState === UserStates.STARTED) {
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
		
		if (activeRaces[raceID].users[userID]) {
			socket.emit("error_message", "Already participant in requested race.");
			return;
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
					user.state = UserStates.STARTING;
					let now = Date.now();
					let remainingTime = Math.max(0, activeRaces[raceID].startTime - now);
					let startRaceFn = getStartRaceFunction(raceID, userID);
					setTimeout(startRaceFn, remainingTime);
					console.log("remaining time = " + remainingTime);
					user.connection.emit("start_race_timer", remainingTime, usersInRace);
				}
			}
		}
	});
	
	socket.on("progress_report", function(raceID, userID, progress) {
		console.log("got progress report from " + userID);
		if (!activeRaces[raceID] || !activeRaces[raceID].users[userID]) {
			console.log("warning: report for dead race.");
			socket.emit("force_refresh", "Tried to play a nonexistent race... try refreshing the webpage.");
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
		console.log("user " + userID + " quitting race " + raceID);
		if (activeRaces[raceID]) {
			let user = activeRaces[raceID].users[userID];
			// sometimes the server had to restart, so people might quit nonexistent races
			if (!user) {
				socket.emit("force_refresh", "Tried to quit a nonexistent race... try refreshing the webpage.");
				return;
			}
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
		// sometimes the server had to restart, so people might be on zombie races
		if (!activeRaces[raceID] || !activeRaces[raceID].users[userID]) {
			socket.emit("force_refresh", "Tried to finish a nonexistent race... try refreshing the webpage.");
			return;
		}
		let now = Date.now();
		let duration = now - activeRaces[raceID].startTime;
		activeRaces[raceID].users[userID].finishTime = duration;
		activeRaces[raceID].users[userID].progress.currentLine = activeRaces[raceID].users[userID].progress.totalLines;
		activeRaces[raceID].users[userID].state = UserStates.FINISHED;
		console.log("!!! " + userID + " FINISHED !!!");
		// robon does individual user statistics
		//
		//
		
		let stats = {
			time: duration
		}
		socket.emit("race_done", stats);
		
		checkRaceCompleted(raceID);
	});
	
	
	
	
	socket.on("test request", function() {
		console.log("  * GOT REQUEST!");
		socket.emit("test receive", "lorem ipsum herp derp");
	});
});
