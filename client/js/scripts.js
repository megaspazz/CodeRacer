
var socket = io();

const States = {
	NONE: 0,
	WAITING_FOR_RACE: 1,
	IN_RACE: 2
};

const Correctness = {
	WRONG: 0,
	PARTIAL: 1,
	CORRECT: 2
}

var currentState = States.NONE;

var currentRaceID = null;
var currentRaceLines = null;
var currentRaceLineDivs = null;
var currentRaceStartTimeMS = null;
var currentUsersInRace = null;
var currentCountdownTimerID = null;

var currentUserID = ~~(Math.random() * 1000000);    // initialize as the current user's ID
console.log("user id = " + currentUserID);

var myProgress = {
	currentLine: null,
	totalLines: null
};

// roger's kool stuff
// check user input, get progress, etc.

function checkUserInput(event) {
	var keyCode = event.keyCode || event.which;
	console.log("got user input");
	var userText = $("#usertextbox").val();
	var correctness = checkCorrectness(userText);
	if (keyCode === 13) {
		if (correctness === Correctness.CORRECT) {
			$("#usertextbox").val("");
			deactivateLine(myProgress.currentLine);
			myProgress.currentLine++;
			activateLine(myProgress.currentLine);
		}
	} else {
		if (correctness !== Correctness.WRONG) {
			console.log("correct");
			$("#usertextbox").removeClass("wrongLine");
		} else {
			console.log("wrong");
			$("#usertextbox").addClass("wrongLine");
		}
	}

}

function trollKey(event) {
	setTimeout(checkUserInput, 0, event);
}

$("#usertextbox").keydown(trollKey);

//$("#usertextbox").keyup(checkUserInput);

//$("#usertextbox").keydown(checkUserInput);

function checkCorrectness(text) {
	var trimmedLine = currentRaceLines[myProgress.currentLine].trim();
	console.log("text = " + text + ", trimmed = " + trimmedLine);
	if (text.length > trimmedLine.length || text !== trimmedLine.substring(0, text.length)) {
		console.log("  > WRONG");
		return Correctness.WRONG;
	} else if (text.length !== trimmedLine.length) {
		console.log("  > partial");
		return Correctness.PARTIAL;
	} else {
		console.log("  > CORREENT");
		return Correctness.CORRECT;
	}
}

function getLines(text) {
	return text.split(/\r?\n/g);
}

// end of roger's kool stuff

function reportProgress() {
	//console.log("reporting progress");
	if (currentState === States.IN_RACE) {
		console.log("    in race!");
		socket.emit("progress_report", currentRaceID, currentUserID, myProgress);
	}
	if (currentState !== States.WAITING_FOR_RACE) {
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
	if (remainingMS <= 0) {
		// TODO: do other stuff to start the race
		$("#countdown").text("");
		currentState = States.IN_RACE;
		//$("#txtCode").text(currentRaceText);
		for (var i = 0; i < currentRaceLineDivs.length; i++) {
			$("#codebox").append(currentRaceLineDivs[i]);
		}
		myProgress = {
			currentLine: 0,
			totalLines: currentRaceLines.length
		};
		activateLine(0);
	} else {
		// TODO: do nothing (?)
		$("#countdown").text(remainingMS);
		setTimeout(updateCountdown, 100);
	}
}

socket.on("found_race", function(raceID, raceText) {
	console.log("got request to start race from server");
	currentState = States.WAITING_FOR_RACE;
	currentRaceLines = getLines(raceText);
	currentRaceLineDivs = currentRaceLines.map(function(line) {
		var divContent = line.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;") || "&nbsp;";
		return $("<div>&nbsp;&nbsp;" + divContent + "</div>");
	});
	currentRaceID = raceID;
	// TODO: process the race text
});

socket.on("start_race_timer", function(startTime, usersInRaceJSON) {
	console.log("starting race timer");
	
	// start the countdown for the race start
	currentRaceStartTimeMS = Date.parse(startTime);
	updateCountdown();
	reportProgress();    // only report progress when the race actually starts
	
	// reset the current users in the race
	currentUsersInRace = { };
	
	// create a new object for users in the race
	var usersInRace = JSON.parse(usersInRaceJSON);
	for (var i = 0; i < usersInRace.length; i++) {
		currentUsersInRace[usersInRace[i]] = { };
	}
});

socket.on("race_state", function(raceID, userProgressesJSON) {
	console.log("got race state");
	var userProgresses = JSON.parse(userProgressesJSON);
	for (var id in userProgresses) {
		var progress = userProgresses[id];
		if (progress) {
			// update UI with other racers' progress
			console.log(id + ": " + progress.currentLine + " / " + progress.totalLines);
		}
	}
});

$("#btnRequestRace").click(function() {
	socket.emit("race_request", currentUserID);
});




$("#btnTestServer").click(function() {
	socket.emit("test request");
});

socket.on("test_receive", function(txt) {
	console.log("got request from server");
	$("#txtCode").text(txt);
});





// what does this do

function test() {
	$(document).ready
}