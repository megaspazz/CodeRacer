const States = {
	NONE: 0,
	WAITING_FOR_RACE: 1,
	IN_RACE: 2,
	FINISHED: 3
};

const Correctness = {
	WRONG: 0,
	PARTIAL: 1,
	CORRECT: 2
}

// requires socket.io to be loaded first
var socket = io();

var currentState = States.NONE;

var currentRaceID = null;
var currentRaceLines = null;
var currentRaceLineDivs = null;
var containerDivs = null;
var opponentDivs = null;
var opponentLastLine = { };
var currentRaceStartTimeMS = null;
var currentUsersInRace = null;

var countdownIntervalID = null;

var currentUserID = ~~(Math.random() * 1000000000);    // initialize as the current user's ID
console.log("user id = " + currentUserID);

// this object will be sent to the server when reporting progress
// properties shown below are only for display, they will be reset at the start of every race
var myProgress = {
	currentLine: null,
	totalLines: null,
	maxLinePos: null,
	numCorrectKeys: null,
	numWrongKeys: null
};

var lastLineLength = null;

// roger's kool stuff
// check user input, get progress, etc.

function checkUserInput(event) {
	var keyCode = event.keyCode || event.which;
	var userText = $("#usertextbox").val();
	var correctnessObj = getCorrectness(userText);
	var correctness = correctnessObj.correctness;
	var correctLength = correctnessObj.length;
	if (keyCode === 13) {
		if (correctness === Correctness.CORRECT) {
			var usertextbox = $("#usertextbox");
			usertextbox.val("");
			deactivateLine(myProgress.currentLine);
			myProgress.currentLine++;
			myProgress.maxLinePos = 0;
			myProgress.numCorrectKeys++;
			lastLineLength = 0;
			if (myProgress.currentLine < myProgress.totalLines) {
				activateLine(myProgress.currentLine);
			} else {
				usertextbox.prop("disabled", true);
				$("#btnRequestRace").prop("disabled", false);
				$("#btnQuitRace").prop("disabled", true);
				currentState = States.FINISHED;
				socket.emit("race_finished", currentRaceID, currentUserID, myProgress);
			}
		} else {
			myProgress.numWrongKeys++;
		}
	} else {
		if (correctness !== Correctness.WRONG) {
			$("#usertextbox").removeClass("wrongLine");
			$(currentRaceLineDivs[myProgress.currentLine]).removeClass("wrongCurrentLine");
		} else {
			$("#usertextbox").addClass("wrongLine");
			$(currentRaceLineDivs[myProgress.currentLine]).addClass("wrongCurrentLine");
			if (userText.length > lastLineLength) {
				myProgress.numWrongKeys++;
			}
		}
		
		// number of correct keys is always up to the farthest position they have reached in the code
		var diff = userText.length - myProgress.maxLinePos;
		if (diff > 0) {
			myProgress.numCorrectKeys += diff;
			myProgress.maxLinePos = userText.length;
		}
		
		// update this to be the most recent line length value
		lastLineLength = userText.length;
	}
}

$("#usertextbox").keydown(function(event) {
	setTimeout(checkUserInput, 0, event);
});



// rewrite this function to combine getCorrectnessLength and checkCorrectness
// and then you can delete those two functions
function getCorrectness(txt) {
	return {
		correctness: checkCorrectness(txt),
		correctLength: getCorrectnessLength(txt)
	}
}

function getCorrectnessLength(txt) {
	var trimmedLine = currentRaceLines[myProgress.currentLine].trim();
	var len = Math.min(txt.length, trimmedLine.length);
	for (var i = 0; i < len; i++) {
		if (txt[i] != trimmedLine[i]) {
			return i;
		}
	}
	return len;
}

function checkCorrectness(txt) {
	var trimmedLine = currentRaceLines[myProgress.currentLine].trim();
	if (txt.length > trimmedLine.length || txt !== trimmedLine.substring(0, txt.length)) {
		return Correctness.WRONG;
	} else if (txt.length !== trimmedLine.length) {
		return Correctness.PARTIAL;
	} else {
		return Correctness.CORRECT;
	}
}

function getLines(txt) {
	return txt.split(/\r?\n/g);
}

// end of roger's kool stuff

function reportProgress() {
	//console.log("reporting progress");
	if (currentState === States.IN_RACE || currentState === States.FINISHED) {
		console.log("    in race!");
		socket.emit("progress_report", currentRaceID, currentUserID, myProgress);
	}
	if (currentState !== States.NONE) {
		setTimeout(reportProgress, 1000);
	}
}

function activateLine(activeLine) {
	var activeDiv = currentRaceLineDivs[activeLine];
	activeDiv.addClass("currentLine");
	var currentText = activeDiv.text();
	var newText = ">" + currentText.substring(1);
	activeDiv.text(newText);
}

function deactivateLine(inactiveLine) {
	var inactiveDiv = currentRaceLineDivs[inactiveLine];
	inactiveDiv.removeClass("currentLine");
	var currentText = inactiveDiv.text();
	var newText = "\xA0" + currentText.substring(1);
	inactiveDiv.text(newText);
}

function updateCountdown() {
	var currTime = new Date();
	var remainingMS = currentRaceStartTimeMS - currTime.getTime();
	$("#countdown").text(remainingMS);
}

socket.on("found_race", function(raceID) {
	console.log("got request to start race from server");
	currentRaceID = raceID;
	currentState = States.WAITING_FOR_RACE;
	$("#btnRequestRace").prop("disabled", true);
	$("#btnQuitRace").prop("disabled", false);
	$("#codebox").empty();
	$("#countdown").text("waiting for competitors to join...");
	$("#stats").hide();
});

function updateCurrentUsersInRace(usersInRace) {
	// reset the current users in the race
	currentUsersInRace = { };
	
	// create a new object for users in the race
	for (var i = 0; i < usersInRace.length; i++) {
		currentUsersInRace[usersInRace[i]] = { };
	}
}

socket.on("start_race_timer", function(raceID, countdownTime, usersInRace) {
	console.log("starting race timer for: " + raceID);
	
	if (!countdownIntervalID) {
		console.log("actually starting race timer");
		
		// start the countdown for the race start
		var now = Date.now();
		currentRaceStartTimeMS = new Date(now + countdownTime);
		countdownIntervalID = setInterval(updateCountdown, 40);
		reportProgress();    // only report progress when the race actually starts
		
		updateCurrentUsersInRace(usersInRace);
	}
});

socket.on("update_users_in_race", function(raceID, usersInRace) {
	console.log("updating users in the race");
	
	updateCurrentUsersInRace(usersInRace);
});

function updateOpponentProgress(opponentID, currLine) {
	var lastLine = opponentLastLine[opponentID];
	if (lastLine !== currLine) {
		// clear the race marker from the opponent's last line
		// the default of undefined will actually evaluate to false
		if (lastLine >= 0) {
			opponentDivs[lastLine][opponentID].text("");
		}
		
		// update the opponent's race marker
		var lineCnt = currentRaceLines.length;
		if (currLine < lineCnt) {
			// opponent did not finish yet
			opponentDivs[currLine][opponentID].text("V");
		} else {
			// opponent finished the race
			for (var i = 0; i < lineCnt; i++) {
				opponentDivs[i][opponentID].text("$");	
			}
		}
		opponentLastLine[opponentID] = currLine;
	}
}

socket.on("start_race", function(raceID, raceText) {
	clearInterval(countdownIntervalID);
	countdownIntervalID = null;
	
	$("#countdown").text("");
	currentState = States.IN_RACE;
	
	currentRaceLines = getLines(raceText);
	currentRaceLineDivs = currentRaceLines.map(function(line) {
		var lineText = line.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;") || "&nbsp;";
		var divLine = $("<div>&nbsp;&nbsp;" + lineText + "</div>");
		divLine.addClass("codeLine");
		return divLine;
	});
	
	var codebox = $("#codebox");
	containerDivs = [];
	opponentDivs = [];
	for (var i = 0; i < currentRaceLines.length; i++) {
		var divContainer = $("<div></div>");
		divContainer.addClass("lineContainer");
		containerDivs.push(divContainer);
		
		opponentDivs.push({ });
		for (var userID in currentUsersInRace) {
			var divOpponent = $("<div></div>");
			divOpponent.addClass("opponent");
			opponentDivs[i][userID] = divOpponent;
			divContainer.append(divOpponent);
		}
		
		divContainer.append(currentRaceLineDivs[i]);
		
		codebox.append(divContainer);
	}
	
	// initialize opponent markers
	opponentLastLine = { };
	for (var userID in currentUsersInRace) {
		updateOpponentProgress(userID, 0);
	}
	
	//$("#txtCode").text(currentRaceText);
	//var codebox = $("#codebox");
	//for (var i = 0; i < currentRaceLineDivs.length; i++) {
	//	codebox.append(currentRaceLineDivs[i]);
	//}
	myProgress = {
		currentLine: 0,
		totalLines: currentRaceLines.length,		
		maxLinePos: 0,
		numCorrectKeys: 0,
		numWrongKeys: 0
	};
	activateLine(0);
	var usertextbox = $("#usertextbox");
	usertextbox.prop("disabled", false);
	usertextbox.text("");
	usertextbox.focus();
});

function updateProgresses(userProgresses) {
	for (var id in userProgresses) {
		var progress = userProgresses[id];
		if (progress) {
			// @huboy update UI with other racers' progress
			console.log(id + ": " + progress.currentLine + " / " + progress.totalLines);
			
			updateOpponentProgress(id, progress.currentLine);
		}
	}
}

socket.on("race_state", function(raceID, userProgresses) {
	console.log("got race state");
	updateProgresses(userProgresses);
});

socket.on("race_done", function(stats) {
	$("#stats").show();
	$("#statsTime").text(stats.time);
	$("#statsRank").text(stats.rank);
	$("#statsAccuracy").text((100 * stats.accuracy).toFixed(2) + "%");
	$("#statsCharsPerMin").text(stats.charsPerMin.toFixed(2));
	$("#statsCharsPerMin").attr("title", (stats.charsPerMin / 5).toFixed(2) + " WPM");
});

socket.on("race_all_done", function(raceID, userProgresses) {
	console.log("race all done from server!");
	if (raceID === currentRaceID) {
		// do end-of-race things here
		updateProgresses(userProgresses);
		currentState = States.NONE;
	}
});

socket.on("after_quit_race", function(raceID) {
	console.log("after quit race (event from server)");
	
	clearInterval(countdownIntervalID);
	countdownIntervalID = null;
	
	currentState = States.NONE;
	$("#countdown").text("");
	$("#usertextbox").val("");
	$("#usertextbox").prop("disabled", true);
	$("#usertextbox").removeClass("wrongLine");
	$("#btnRequestRace").prop("disabled", false);
	$("#btnQuitRace").prop("disabled", true);
	$("#codebox").empty();
});

socket.on("connect_error", function() {
	alert("top kek, the server died so auto refresh to kill ur client, pls check back l8r :/");
	location.reload();
});

socket.on("error_message", function (msg) {
	alert("ERROR:\n" + msg);
});

socket.on("force_refresh", function(msg) {
	alert("CRITICAL ERROR:\n" + msg + "\n\nThe webpage will now refresh.");
	location.reload();
});

$("#btnRequestRace").click(function() {
	var raceID = prompt("Enter the race ID you want to join:", 1997);
	if (raceID) {
		socket.emit("race_request", raceID, currentUserID);
	}
});

function quitRace() {
	socket.emit("quit_race", currentRaceID, currentUserID);
}

$("#btnQuitRace").click(quitRace);

$(window).on("beforeunload", quitRace);






$("#btnTestServer").click(function() {
	socket.emit("test request");
});

socket.on("test_receive", function(txt) {
	console.log("got request from server");
	$("#txtCode").text(txt);
});
