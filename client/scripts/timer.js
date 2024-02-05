let originalTimerDuration = 0;
let timerInterval;
let currentTimerDuration = originalTimerDuration;

function startTimer(durationInSeconds) {
  let timerElement = document.getElementById("timer");

  clearInterval(timerInterval); // Clear any existing interval

  currentTimerDuration = durationInSeconds;

  timerInterval = setInterval(function () {
    let minutes = Math.floor(currentTimerDuration / 60);
    let seconds = currentTimerDuration % 60;

    timerElement.textContent = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;

    if (--currentTimerDuration < 0) {
      clearInterval(timerInterval);
      timerElement.textContent = "Time over!";
    }
  }, 1000);
}

function resetTimer() {
  clearInterval(timerInterval);
  currentTimerDuration = originalTimerDuration;
  document.getElementById("timer").textContent = "00:00";
}
