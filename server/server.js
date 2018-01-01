var path = require("path");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

var fs = require("fs");

const UserStates = {
	NONE: 0,
	STARTING: 1,
	STARTED: 2,
	FINISHED: 3,
	QUIT: 4,
	TIMEOUT: 5
}

const LoginResult = {
	CORRECT_LOGIN: 1,
	INCORRECT_PASS: 0,
	INCORRECT_USER: -1
}

const PRE_RACE_TIME = 10000;
const UPDATE_INTERVAL_TIME = 1000;
const MAX_RACE_TIME = 300000;

const MIN_RACE_JOIN_TIME = 3000;
const MAX_RACE_SIZE = 5;

const PORT = 1997;
const CLIENT_PATH = path.resolve(__dirname + "/../client");
const RACE_TEXTS_PATH = __dirname + "/race_texts";

var activeRaces = { };
var activeUsers = { };    // NYI

app.use("/css",  express.static(CLIENT_PATH + "/css"));
app.use("/js",  express.static(CLIENT_PATH + "/js"));
app.use("/assets",  express.static(CLIENT_PATH + "/assets"));

app.get('/', function(req, res) {
	res.sendFile(CLIENT_PATH + "/index.html");
});

http.listen(PORT, function() {
	serverLog("starting server on *:" + PORT);
});


/**
 * Pads the input string with the specified character to the desired length.
 * 
 * @param {*} orig the text to pad
 * @param {*} padChar the character used to pad
 * @param {*} targetLen the desired new length of the string
 */
function padLeft(orig, padChar, targetLen) {
	let str = String(orig);
	let padLen = targetLen - str.length;
	if (padLen <= 0) {
		return str;
	}
	return padChar.repeat(padLen) + str;
}

/**
 * Formats the input date as a string.
 * 
 * @param {Date} dateTime the date to format
 * @returns {string} the formatted date
 */
function getDateTimeDisplay(dateTime) {
	let yr = padLeft(dateTime.getFullYear(), "0", 4);
	let mo = padLeft(dateTime.getMonth() + 1, "0", 2);
	let dt = padLeft(dateTime.getDay(), "0", 2);
	let hr = padLeft(dateTime.getHours(), "0", 2);
	let mn = padLeft(dateTime.getMinutes(), "0", 2);
	let sc = padLeft(dateTime.getSeconds(), "0", 2);
	let ms = padLeft(dateTime.getMilliseconds(), "0", 3);
	return mo + "/" + dt + "/" + yr + " " + hr + ":" + mn + ":" + sc + "." + ms;
}

/**
 * Logs the message in the server.
 * 
 * @param {string} msg the message to log.
 */
function serverLog(msg) {
	console.log("[" + getDateTimeDisplay(new Date()) + "] " + msg);
}

/**
 * Gets the progresses of each user in the specified race.
 * 
 * @param {*} raceID the id of the race to retrieve data from
 * @returns {*} an object mapping from userID to progress, where progress is an object containing
 *              currentLine, totalLines, maxLinePos, numCorrectKeys, numWrongKeys.
 */
function getUserProgresses(raceID) {
	let userProgresses = { };
	for (let userID in activeRaces[raceID].users) {
		userProgresses[userID] = activeRaces[raceID].users[userID].progress;
	}
	return userProgresses;
}

/**
 * Returns the function that starts a race.
 * 
 * @param {*} raceID the race to start.
 */
function getStartRaceFunction(raceID) {
	return function() {
		if (activeRaces[raceID]) {
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				if (user && user.state == UserStates.STARTING) {
					user.state = UserStates.STARTED;
					user.connection.emit("start_race", raceID, activeRaces[raceID].raceText);
				}
			}
			let progressUpdateFcn = getProgressUpdateFunction(raceID);
			activeRaces[raceID].updateIntervalID = (
				setInterval(progressUpdateFcn, UPDATE_INTERVAL_TIME)
			);
		}
	}
}

/**
 * Returns the function that updates the race progress.
 * 
 * @param {*} raceID the race whose progress is being updated
 */
function getProgressUpdateFunction(raceID) {
	return function() {
		if (!activeRaces[raceID]) {
			// something bad happened, and now it's stuck in an interval
			// if this actually happens, we can change this to be a timeout instead of interval
			serverLog("PRETTY SERIOUS ERROR!  Interval is stuck infinite looping!");
			return;
		}
		serverLog("sending progress");
		let race = activeRaces[raceID];
		let now = Date.now();
		let elapsedTime = now - race.startTime;
		
		// check if the race has timed out
		if (elapsedTime > MAX_RACE_TIME) {
			for (let userID in race.users) {
				let user = race.users[userID];
				// kick the users who aren't done yet, although they can probably only be in STARTED
				// state at this point
				if (user.state === UserStates.NONE
					|| user.state === UserStates.STARTING
					|| user.state === UserStates.STARTED) {
					user.state = UserStates.TIMEOUT;
				}
			}
			completeRace(raceID);
			return;
		}
		
		// send progress to all users in the race
		let userProgresses = getUserProgresses(raceID);
		for (let userID in activeRaces[raceID].users) {
			let user = activeRaces[raceID].users[userID];
			user.connection.emit("race_state", raceID, userProgresses);
		}
	}
}

/**
 * Checks if the race has been completed.
 * 
 * @param {*} raceID the race to check for completion
 * @returns {Boolean} whether or not the race has been completed
 */
function checkRaceCompleted(raceID) {
	let done = true;
	for (let id in activeRaces[raceID].users) {
		let userState = activeRaces[raceID].users[id].state;
		// is might be better to say that it's not FINISHED or QUIT
		if (userState === UserStates.NONE
			|| userState === UserStates.STARTING
			|| userState === UserStates.STARTED) {
			done = false;
			break;
		}
	}
	if (done) {
		completeRace(raceID);
	}
	return done;
}

/**
 * Finishes the given race, performing the necessary cleanup work and adding the race to the
 * database.
 * 
 * @param {*} raceID the id of the race that was completed
 */
function completeRace(raceID) {
	// stop the progress update interval
	clearInterval(activeRaces[raceID].updateIntervalID);
	
	// TODO: robon saves match into history table
	let statsMap = { };

	for (let id in activeRaces[raceID].users) {
		statsMap[id] = activeRaces[raceID].users[id].stats;
	}

	addRaceToHistory(statsMap, activeRaces[raceID].raceTextTitle);

	// end of saving into database

	serverLog("*** " + raceID + " ALL DONE ***");
	for (let id in activeRaces[raceID].users) {
		let user = activeRaces[raceID].users[id];
		let userProgresses = getUserProgresses(raceID);
		user.connection.emit("race_all_done", raceID, userProgresses);
	}
	delete activeRaces[raceID];
}

/**
 * Checks whether or not the specified race has started.
 * 
 * @param {*} raceID the id of the race to check
 */
function checkRaceStarted(raceID) {
	let currTime = Date.now();
	return (activeRaces[raceID] && activeRaces[raceID].startTime
		&& currTime > activeRaces[raceID].startTime);
}

/**
 * Returns the users in the specified race.
 * 
 * @param {*} raceID the id of the race to check
 */
function getUsersInRace(raceID) {
	let usersInRace = [];
	for (let userID in activeRaces[raceID].users) {
		let user = activeRaces[raceID].users[userID];
		usersInRace.push(user.name);
	}
	return usersInRace;
}

io.on("connection", function(socket) {
	serverLog("+ CONNECTION @ " + socket.request.connection.remoteAddress);

	socket.on("race_request", function(userID) {
		serverLog("got race request");

		// section below: search for a non-full room or create a new one if one doesn't exist
		let raceID;
		let foundRace = false;

		for (let activeRaceID in activeRaces) {
			// first checks if there is a race that hasn't set a start time yet (i.e. there is
		    //   only one user)
			// then checks if the race has more than the minimum amount of time before starting
			// then checks if the race has fewer than the maximum number of people in it
			if ((activeRaces[activeRaceID].startTime == null ||
					activeRaces[activeRaceID].startTime - Date.now() >= MIN_RACE_JOIN_TIME) &&
					Object.keys(activeRaces[activeRaceID].users).length < MAX_RACE_SIZE) {
				raceID = activeRaceID;
				foundRace = true;
				break;
			}
		}

		if (!foundRace) {
			do {
				raceID = Math.random().toString(); // generate a random ID
			} while (activeRaces[raceID]);         // hope that it doesn't exist
		}

		// generate a new race if necessary
		if (!activeRaces[raceID]) {
			let fileNames = fs.readdirSync(RACE_TEXTS_PATH);
			let fileNum = ~~(Math.random() * fileNames.length);
			let fullFilePath = path.join(RACE_TEXTS_PATH, fileNames[fileNum]);
			let codeText = fs.readFileSync(fullFilePath, "utf8");
			let selectedText = fileNames[fileNum];

			serverLog("new raceID = " + raceID);
			serverLog(fileNames);
			serverLog(fileNames[fileNum]);
			serverLog("SEE CODE BELOW!\n" + codeText);

			activeRaces[raceID] = {
				users: { },
				startTime: null,
				updateIntervalID: null,
				finishedRacers: 0,
				codeFile: fileNames[fileNum],
				raceTextTitle: selectedText,
				raceText: codeText
			};
		}
		
		if (activeRaces[raceID].users[userID]) {
			var userState = activeRaces[raceID].users[userID].state;
			switch (userState) {
				case UserStates.QUIT:
					socket.emit("error_message",
						"Cannot rejoin after quitting in the middle of a race.");
					break;
				case UserStates.FINISHED:
					socket.emit("error_message", "Already finished the requested race.");
					break;
				default:
					socket.emit("error_message", "Already participant in requested race.");
					break;
			}
			return;
		}
		
		if (checkRaceStarted(raceID)) {
			socket.emit("error_message", "Cannot join a race that has already started.");
			return;
		}

		socket.emit("found_race", raceID);
		activeRaces[raceID].users[userID] = {
			name: userID,    // TODO: make this the actual display name
			connection: socket,
			progress: null,
			state: UserStates.NONE,
			finishTime: NaN
		}
		if (Object.keys(activeRaces[raceID].users).length >= 2) {
			if (!activeRaces[raceID].startTime) {
				let now = Date.now();
				var time = now + PRE_RACE_TIME;
				activeRaces[raceID].startTime = time;
				let startRaceFn = getStartRaceFunction(raceID);
				setTimeout(startRaceFn, PRE_RACE_TIME);
			}
			
			let usersInRace = getUsersInRace(raceID);
			
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				if (user.state === UserStates.NONE) {
					user.state = UserStates.STARTING;
					let now = Date.now();
					let remainingTime = Math.max(0, activeRaces[raceID].startTime - now);
					serverLog("remaining time = " + remainingTime);
					user.connection.emit("start_race_timer", raceID, remainingTime, usersInRace);
				} else if (user.state === UserStates.STARTING) {
					user.connection.emit("update_users_in_race", raceID, usersInRace);
				}
			}
		}
	});
	
	socket.on("progress_report", function(raceID, userID, progress) {
		serverLog("got progress report from " + userID);
		if (!activeRaces[raceID] || !activeRaces[raceID].users[userID]) {
			serverLog("warning: report for dead race.");
			socket.emit("force_refresh",
				"Tried to play a nonexistent race... try refreshing the webpage.");
			return;
		}

		activeRaces[raceID].users[userID].progress = progress;
	});

	socket.on("disconnect", function() {
		serverLog("- DISCONNECTION @ " + socket.request.connection.remoteAddress);
	});
	
	socket.on("quit_race", function(raceID, userID) {
		serverLog("user " + userID + " quitting race " + raceID);
		
		// let the user know that they quit the race, even if it was non-existent or if they didn't
		// belong to the race
		socket.emit("after_quit_race", raceID);
		
		if (activeRaces[raceID]) {
			if (checkRaceStarted(raceID)) {
				// if the race has already started, then we will mark the user as quitting the race
				let user = activeRaces[raceID].users[userID];
				
				// sometimes the server had to restart, so people might quit nonexistent races
				// in this case we will just let them know that they quit
				if (!user) {
					serverLog(
						"warning: unregistered user " + userID  + " tried to quit race " + raceID
					);
				}
				
				// if the user didn't finish the race we should record it in the stats
				if (user && !user.finishTime) {
					user.state = UserStates.QUIT;
					checkRaceCompleted(raceID);
				}
			} else {
				// if the race didn't start yet, we will just delete them from the list of racers
				if (activeRaces[raceID].users[userID]) {
					delete activeRaces[raceID].users[userID];
					let done = checkRaceCompleted(raceID);
					if (!done) {
						// if the race isn't over, update the list of racers for those still in the
						// race
						let usersInRace = getUsersInRace(raceID);
						for (let userID in activeRaces[raceID].users) {
							let user = activeRaces[raceID].users[userID];
							user.connection.emit("update_users_in_race", raceID, usersInRace);
						}
					}
				}
			}
		} else {
			serverLog("warning: tried to quit a nonexistent race!");
		}
	});
	
	socket.on("race_finished", function(raceID, userID, progress) {
		serverLog("race finished");
		// sometimes the server had to restart, so people might be on zombie races
		if (!activeRaces[raceID] || !activeRaces[raceID].users[userID]) {
			socket.emit("force_refresh",
				"Tried to finish a nonexistent race... try refreshing the webpage.");
			return;
		}
		
		// calculate how long it took to finish the race
		let now = Date.now();
		let duration = now - activeRaces[raceID].startTime;
		
		// update this user in the set of active races
		activeRaces[raceID].users[userID].finishTime = duration;
		activeRaces[raceID].users[userID].progress = progress;
		activeRaces[raceID].users[userID].state = UserStates.FINISHED;
		serverLog("!!! " + userID +  " FINISHED !!!");
		
		// update the number of finished racers, which is also the user's placement in the race
		activeRaces[raceID].finishedRacers++;
		let placement = activeRaces[raceID].finishedRacers;
		
		// calculate the CPM
		let cpm = progress.numCorrectKeys / duration * 60000;
		
		// calculate the accuracy
		let totalKeys = progress.numCorrectKeys + progress.numWrongKeys;
		let accuracyRating = progress.numCorrectKeys / totalKeys;

		let stats = {
			time: duration,
			rank: placement,
			accuracy: accuracyRating,
			charsPerMin: cpm
		}

		activeRaces[raceID].users[userID].stats = stats;

		socket.emit("race_done", stats);
		
		checkRaceCompleted(raceID);
	});

	// TODO: (?) BEGIN RANDO STUFF
	socket.on("create_account", function(username, password, email, displayName) {
		addUser(username, displayName, email, password);

		// TODO: add 'protection' here later so we know if user was actually
		// successfully added
		socket.emit("login_result", 1, username);
	});

	socket.on("login", function(username, password) {
		checkLogin(username, password, function(returnValue) {
			//  1 -> success
			//  0 -> failed password
			// -1 -> failed username
			socket.emit("login_result", returnValue, username);
		});
	});
	
	
	socket.on("test request", function() {
		serverLog("  * GOT REQUEST!");
		socket.emit("test receive", "lorem ipsum herp derp");
	});
});

/**********************************************************
 ******************** MONGO BORG **************************
 **********************************************************/

 "use strict";

let MongoClient = require("mongodb").MongoClient;
let url = "mongodb://localhost:27017/coderacerdb";

// TODO: for all functions, first verify validity of args
	// when updating user, verify user exists? current implementation is
	// it will just do nothing
	// i think

// registers a completely new user
// make sure uname is actually unique
function addUser(uname, dispName, userEmail, pass) {
	MongoClient.connect(url, null, (err, db) => {
		if (err) {
			serverLog("ERROR: addUser: connect: ", err);
			return;
		}
		serverLog("SUCCESS: addUser: connect: ", url);
		let collection = db.collection("users");
		let today = new Date();
		let newStats = { wpm: 0, wpm10: 0, numRaces: 0 };
		let hist = [];
		let user = {
			username: uname,
			displayName: dispName,
			email: userEmail,
			password: pass,
			joinDate: today,
			stats: newStats,
			history: hist
		};
		collection.insertOne(user, null, (err, result) => {
			if (err) {
				serverLog("ERROR: addUser: insertOne: ", err);
				db.close();
				return;
			}
			serverLog("SUCCESS: addUser: insertOne: ", "<opt. result text>");
			db.close();
		});
	});
}

function checkLogin(uname, pword, returnFunction) {
	MongoClient.connect(url, (err, db) => {
		let collection = db.collection("users");
		
		let query = { username : uname };
		collection.find(query).toArray((err, items) => {
			if (items.length === 0) {
				returnFunction(LoginResult.INCORRECT_USER);
			} else if (items[0]["password"] === pword) {
				returnFunction(LoginResult.CORRECT_LOGIN);
			} else {
				returnFunction(LoginResult.INCORRECT_PASS);
			}
		});
		db.close();	// dont actually know if this does anything
		
	});
}

// update an existing user's name
function updateUserDisplayName(uname, dispName) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			serverLog("ERROR: updateUserDisplayName: connect: ", err);
			return;
		} 
		serverLog("SUCCESS: updateUserDisplayName: connect: ", url);
		let collection = db.collection("users");
		collection.updateOne({ username: uname },
			{ $set: { displayName: dispName } },
			(err, result) => {
				if (err) {
					serverLog("ERROR: updateUserDisplayName: updateOne: ", err);
					db.close();
					return;
				}
				serverLog("SUCCESS: updateUserDisplayName: updateOne: ", "<opt. result text>");
				db.close();
			}
		);
	});
}

// update an existing user's email
function updateUserEmail(uname, userEmail) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			serverLog("ERROR: updateUserEmail: connect: ", err);
			return;
		} 
		serverLog("SUCCESS: updateUserEmail: connect: ", url);
		let collection = db.collection("users");
		collection.updateOne({ username: uname },
			{ $set: { email: userEmail } },
			(err, result) => {
				if (err) {
					serverLog("ERROR: updateUserEmail: updateOne: ", err);
					db.close();
					return;
				}
				serverLog("SUCCESS: updateUserEmail: updateOne: ", "<opt. result text>");
				db.close();
			}
		);
	});
}

// update an existing user's password
function updateUserPassword(uname, pass) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			serverLog("ERROR: updateUserPassword: connect: ", err);
			return;
		}
		serverLog("SUCCESS: updateUserPassword: connect: ", url);
		let collection = db.collection("users");
		collection.updateOne({ username: uname },
			{ $set: { password: pass } },
			(err, result) => {
				if (err) {
					serverLog("ERROR: updateUserPassword: updateOne: ", err);
					db.close();
					return;
				}
				serverLog("SUCCESS: updateUserPassword: updateOne: ", "<opt. result text>");
				db.close();
			}
		);
	});
}

// figure out global history list
function addRaceToHistory(my_statsMap, raceTitle) {
	// connect to database
	MongoClient.connect(url, (err, db) => {
		if (err) {
			serverLog("ERROR: addRaceToHistory: connect: ", err);
			return;
		}
		serverLog("SUCCESS: addRaceToHistory: connect: ", url);
		let collection = db.collection("globalHistory");
		let timestamp = new Date();
		let raceNumber = 0;
		collection.count((err, count) => {
			raceNumber = count + 1;
			let race = {
				statsMap: my_statsMap,
				title: raceTitle,
				id: raceNumber,
			};
			// add raceNumber to everyone that was in the race
			let userCollection = db.collection("users");
			for (let id in my_statsMap) {
				userCollection.updateOne({ username: id },
					{ $push: { history: raceNumber } },
					(err, result) => {
						if (err) {
							serverLog("ERROR: addRaceToHistory: updateOne: ", err);
							db.close();
							return;
						}
						serverLog("SUCCESS: addRaceToHistory: updateOne: ", "<opt. result text>");
						db.close();
					}
				);
			}
			// add race to globalHistory
			collection.insertOne(race, null, (err, result) => {
				if (err) {
					serverLog("ERROR: addRaceToHistory: insertOne: ", err);
					db.close();
					return;
				}
				serverLog("SUCCESS: addRaceToHistory: insertOne: ", "<opt. result text>");
				db.close();
			});
		});
	});
}