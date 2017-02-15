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

const LoginResult = {
	CORRECT_LOGIN: 1,
	INCORRECT_PASS: 0,
	INCORRECT_USER: -1
}

const MAX_RACE_SIZE = 5;

var socket = io();		// requires socket.io to be loaded first

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
	setupUserTextBox();
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
				$("#btnFindRace").prop("disabled", false);
				$("#btnFindRace").show();
				$("#btnQuitRace").prop("disabled", true);
				$("#btnQuitRace").hide();
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
	setupUserTextBox();
}

$("#usertextbox").keydown(function(event) {
	// make sure that the user isn't editing the automatically-inserted spacing at the beginning
	var usertextbox = document.getElementById("usertextbox");
	var spaces = getLeadingSpaces(currentRaceLines[myProgress.currentLine]);
	usertextbox.selectionStart = Math.max(usertextbox.selectionStart, spaces);
	
	// check the user input in a timer callback so that the input will be part of the textbox
	setTimeout(checkUserInput, 0, event);
});

function getLeadingSpaces(txt) {
	var spaces = 0;
	for (var i = 0; i < txt.length; ++i) {
		if (txt[i] === "\t") {
			spaces += 4;
		} else if (txt[i] === " ") {
			++spaces;
		} else {
			break;
		}
	}
	return spaces;
}

function setupUserTextBox() {
	if (myProgress.currentLine >= currentRaceLines.length) {
		return;
	}
	var currLine = currentRaceLines[myProgress.currentLine];
	var spaces = getLeadingSpaces(currLine);
	var usertextbox = document.getElementById("usertextbox");
	var currTxt = usertextbox.value;
	if (currTxt.length < spaces) {
		usertextbox.value = " ".repeat(spaces);
	}
	usertextbox.selectionStart = Math.max(usertextbox.selectionStart, spaces);
}



// rewrite this function to combine getCorrectnessLength and checkCorrectness
// and then you can delete those two functions
function getCorrectness(txt) {
	return {
		correctness: checkCorrectness(txt),
		correctLength: getCorrectnessLength(txt)
	}
}

function getCorrectnessLength(txt) {
	var currLine = currentRaceLines[myProgress.currentLine];
	var expectedSpaces = getLeadingSpaces(currLine);
	var actualSpaces = getLeadingSpaces(txt);
	if (expectedSpaces !== actualSpaces) {
		return 0;
	}
	var trimmedLine = currLine.trim();
	var fixedTxt = txt.trimLeft();
	var len = Math.min(fixedTxt.length, trimmedLine.length);
	for (var i = 0; i < len; i++) {
		if (fixedTxt[i] != trimmedLine[i]) {
			return i;
		}
	}
	return len;
}

function checkCorrectness(txt) {
	var currLine = currentRaceLines[myProgress.currentLine];
	var expectedSpaces = getLeadingSpaces(currLine);
	var actualSpaces = getLeadingSpaces(txt);
	var trimmedLine = currentRaceLines[myProgress.currentLine].trim();
	var fixedTxt = txt.trimLeft();
	if (expectedSpaces !== actualSpaces || fixedTxt.length > trimmedLine.length || fixedTxt !== trimmedLine.substring(0, fixedTxt.length)) {
		return Correctness.WRONG;
	} else if (fixedTxt.length !== trimmedLine.length) {
		return Correctness.PARTIAL;
	} else {
		return Correctness.CORRECT;
	}
}

function getLines(txt) {
	return txt.split(/\r?\n/g);
}

function padRight(orig, padChar, targetLen) {
	var str = String(orig);
	var padLen = targetLen - str.length;
	if (padLen <= 0) {
		return str;
	}
	return str + padChar.repeat(padLen);
}

// end of roger's kool stuff

function reportProgress() {
	if (currentState === States.IN_RACE) {
		console.log("    in race!");
		socket.emit("progress_report", currentRaceID, currentUserID, myProgress);
		setTimeout(reportProgress, 1000);
	}
}

function activateLine(activeLine) {
	var activeDiv = currentRaceLineDivs[activeLine];
	activeDiv.addClass("currentLine");
}

function deactivateLine(inactiveLine) {
	var inactiveDiv = currentRaceLineDivs[inactiveLine];
	inactiveDiv.removeClass("currentLine");
}

function updateCountdown() {
	var currTime = new Date();
	var remainingMS = currentRaceStartTimeMS - currTime.getTime();
	$("#countdown").text("Countdown: " + (remainingMS / 1000).toFixed(3) + " sec.");
}

socket.on("found_race", function(raceID) {
	console.log("got request to start race from server");
	currentRaceID = raceID;
	currentState = States.WAITING_FOR_RACE;
	$("#btnFindRace").prop("disabled", true);
	$("#btnFindRace").hide();
	$("#btnQuitRace").prop("disabled", false);
	$("#btnQuitRace").show();
	$("#usertextbox").attr("placeholder", "Type each line of the code below here when the race starts!");
	$("#codebox").empty();
	$("#countdown").text("Waiting for competitors to join...");
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
	
	$("#usertextbox").removeAttr("placeholder");
	
	currentRaceLines = getLines(raceText);
	
	var lineTexts = currentRaceLines.map(function(line) {
		return line.replace(/\t/g, "    ");
	});
	
	var maxLineLength = lineTexts.reduce(function(maxSoFar, line) {
		return Math.max(maxSoFar, line.length);
	}, 0);
	
	console.log("max = " + maxLineLength);
	
	currentRaceLineDivs = lineTexts.map(function(line) {
		var lineText = padRight(line, " ", maxLineLength).replace(/ /g, "&nbsp;");
		var divLine = $("<div>" + lineText + "</div>");
		divLine.addClass("codeLine");
		return divLine;
	});
	
	var userCount = Object.keys(currentUsersInRace).length;
	var codebox = $("#codebox");
	containerDivs = [];
	opponentDivs = [];
	for (var i = 0; i < currentRaceLines.length; i++) {
		var divContainer = $("<div></div>");
		divContainer.addClass("lineContainer");
		containerDivs.push(divContainer);
		
		// pad the space on the left if the race isn't full
		for (var j = userCount; j < MAX_RACE_SIZE; ++j) {
			var divOpponent = $("<div></div>");
			divOpponent.addClass("opponent");
			divContainer.append(divOpponent);
		}
		
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
	
	reportProgress();    // report progress when the race actually starts
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
	$("#statsTime").text(((stats.time) / 1000).toFixed(3));
	$("#statsRank").text(stats.rank);
	$("#statsAccuracy").text((100 * stats.accuracy).toFixed(2) + "%");
	$("#statsCharsPerMin").text(stats.charsPerMin.toFixed(2));
	$("#statsCharsPerMin").attr("title", (stats.charsPerMin / 5).toFixed(2) + " WPM");
});

socket.on("race_all_done", function(raceID, userProgresses) {
	console.log("race all done from server!");
	console.log(raceID + " ?= " + currentRaceID);
	console.log(typeof(raceID) + " ?= " + typeof(currentRaceID));
	if (raceID === currentRaceID) {
		// do end-of-race things here
		console.log("all update race kek");
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
	$("#usertextbox").removeAttr("placeholder");
	$("#btnFindRace").prop("disabled", false);
	$("#btnFindRace").show();
	$("#btnQuitRace").prop("disabled", true);
	$("#btnQuitRace").hide();
	$("#codebox").empty();
});

socket.on("connect_error", function() {
	alert("You have disconnected from the server.  Check your internet connection and refresh the page.  If that doesn't work, it's possible that the server is temporarily down for maintenance.");
	location.reload();
});

socket.on("error_message", function (msg) {
	alert("ERROR:\n" + msg);
});

socket.on("force_refresh", function(msg) {
	alert("CRITICAL ERROR:\n" + msg + "\n\nThe webpage will now refresh.");
	location.reload();
});

$("#btnFindRace").click(function() {
	socket.emit("race_request", currentUserID);
});

function quitRace() {
	socket.emit("quit_race", currentRaceID, currentUserID);
}

$("#btnQuitRace").click(quitRace);

// RANDO STUFF

function createAccount() {
	// TODO: check for empty forms
	// make the confirm pass actually do something
	let u = $("#username").val();
	let p = $("#password").val();
	let e = $("#email").val();
	let dname = $("#displayName").val();

	socket.emit("create_account", u, p, e, dname);
}

$("#createAcctBtn").click(createAccount);

function login() {
	let u = $("#loginUsername").val();
	let p = $("#loginPassword").val();

	$("#loginUsername").val("");
	$("#loginPassword").val("");
	socket.emit("login", u, p);
}
$("#loginBtn").click(login);

socket.on("login_result", function(result, username) {
	if (result === LoginResult.CORRECT_LOGIN) {
		currentUserID = username;
		console.log("user id = " + currentUserID);
		$("#loginStatus").html("You are now logged in as <strong>" + username + "</strong>.");
	} else if (result === LoginResult.INCORRECT_PASS) {
		$("#loginStatus").html("Wrong password. Try again.");
	} else {
		$("#loginStatus").html("CodeRacer doesn't recognize that username. Try again");
	}
})

// END RANDO STUFF

$(window).on("beforeunload", quitRace);
