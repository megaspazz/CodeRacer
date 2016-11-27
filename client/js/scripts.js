
var socket = io();

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

var currentState = States.NONE;

var currentRaceID = null;
var currentRaceLines = null;
var currentRaceLineDivs = null;
var currentRaceStartTimeMS = null;
var currentUsersInRace = null;
var currentCountdownTimerID = null;

var countdownIntervalID = null;

var currentUserID = ~~(Math.random() * 1000000000);    // initialize as the current user's ID
console.log("user id = " + currentUserID);

var myProgress = {
	currentLine: null,
	totalLines: null
};

// roger's kool stuff
// check user input, get progress, etc.

function checkUserInput(event) {
	var keyCode = event.keyCode || event.which;
	var userText = $("#usertextbox").val();
	var correctness = checkCorrectness(userText);
	if (keyCode === 13) {
		if (correctness === Correctness.CORRECT) {
			var usertextbox = $("#usertextbox");
			usertextbox.val("");
			deactivateLine(myProgress.currentLine);
			myProgress.currentLine++;
			if (myProgress.currentLine < myProgress.totalLines) {
				activateLine(myProgress.currentLine);
			} else {
				usertextbox.prop("disabled", true);
				$("#btnRequestRace").prop("disabled", false);
				$("#btnQuitRace").prop("disabled", true);
				currentState = States.FINISHED;
				socket.emit("race_finished", currentRaceID, currentUserID);
			}
		}
	} else {
		if (correctness !== Correctness.WRONG) {
			$("#usertextbox").removeClass("wrongLine");
			$(currentRaceLineDivs[myProgress.currentLine]).removeClass("wrongCurrentLine");
		} else {
			$("#usertextbox").addClass("wrongLine");
			$(currentRaceLineDivs[myProgress.currentLine]).addClass("wrongCurrentLine");
		}
	}

}

function delayKeyEvent(event) {
	setTimeout(checkUserInput, 0, event);
}

$("#usertextbox").keydown(delayKeyEvent);

//$("#usertextbox").keyup(checkUserInput);

//$("#usertextbox").keydown(checkUserInput);

function checkCorrectness(text) {
	var trimmedLine = currentRaceLines[myProgress.currentLine].trim();
	if (text.length > trimmedLine.length || text !== trimmedLine.substring(0, text.length)) {
		return Correctness.WRONG;
	} else if (text.length !== trimmedLine.length) {
		return Correctness.PARTIAL;
	} else {
		return Correctness.CORRECT;
	}
}

function getLines(text) {
	return text.split(/\r?\n/g);
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

socket.on("found_race", function(raceID, raceText) {
	console.log("got request to start race from server");
	currentRaceID = raceID;
	currentState = States.WAITING_FOR_RACE;
	currentRaceLines = getLines(raceText);
	currentRaceLineDivs = currentRaceLines.map(function(line) {
		var divContent = line.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;") || "&nbsp;";
		return $("<div>&nbsp;&nbsp;" + divContent + "</div>");
	});
	$("#btnRequestRace").prop("disabled", true);
	$("#btnQuitRace").prop("disabled", false);
	$("#codebox").empty();
	$("#countdown").text("waiting for competitors to join...");
});

socket.on("start_race_timer", function(countdownTime, usersInRace) {
	console.log("starting race timer");
	
	if (!countdownIntervalID) {
		console.log("actually starting race timer");
		
		// start the countdown for the race start
		var now = Date.now();
		currentRaceStartTimeMS = new Date(now + countdownTime);
		countdownIntervalID = setInterval(updateCountdown, 40);
		reportProgress();    // only report progress when the race actually starts
		
		// reset the current users in the race
		currentUsersInRace = { };
		
		// create a new object for users in the race
		for (var i = 0; i < usersInRace.length; i++) {
			currentUsersInRace[usersInRace[i]] = { };
		}
	}
});

socket.on("start_race", function() {
	clearInterval(countdownIntervalID);
	countdownIntervalID = null;
	
	$("#countdown").text("");
	currentState = States.IN_RACE;
	//$("#txtCode").text(currentRaceText);
	var codebox = $("#codebox");
	for (var i = 0; i < currentRaceLineDivs.length; i++) {
		codebox.append(currentRaceLineDivs[i]);
	}
	myProgress = {
		currentLine: 0,
		totalLines: currentRaceLines.length
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
		}
	}
}

socket.on("race_state", function(raceID, userProgresses) {
	console.log("got race state");
	updateProgresses(userProgresses);
});

socket.on("race_all_done", function(raceID, userProgresses) {
	console.log("race all done from server!");
	if (raceID === currentRaceID) {
		// do end-of-race things here
		updateProgresses(userProgresses);
		currentState = States.NONE;
	}
});

socket.on("after_quit_race", function() {
	currentState = States.NONE;
	$("#usertextbox").prop("disabled", true);
	$("#btnRequestRace").prop("disabled", false);
	$("#btnQuitRace").prop("disabled", true);
	$("#codebox").empty();
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





// what does this do

function test() {
	$(document).ready
}