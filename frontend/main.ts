import { Game } from './game.js';

// --- 1. NETWORKING SETUP ---
const SERVER_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

const game = new Game(SERVER_URL);

// Setup the Welcome UI Logic
document.addEventListener("DOMContentLoaded", () => {
  const welcomeScreen = document.getElementById("welcome-screen") as HTMLDivElement;
  const nameInput = document.getElementById("player-name") as HTMLInputElement;
  const startButton = document.getElementById("start-btn") as HTMLButtonElement;

  // 1. Enable/Disable button based on input value
  nameInput.addEventListener("input", () => {
    const trimmedName = nameInput.value.trim();
    startButton.disabled = trimmedName.length === 0;
  });

  // 2. Handle Game Start
  const startGame = () => {
    const finalName = nameInput.value.trim();
    if (!finalName) return;

    // Store the name in Session Storage
    sessionStorage.setItem("username", finalName);

    // Hide the login screen (fade out, then remove from layout)
    welcomeScreen.style.opacity = "0";
    setTimeout(() => {
      welcomeScreen.style.display = "none";

      // 3. Fire up your 3D sandbox engine!
      game.initGame();
    }, 500); // matches the 0.5s CSS transition
  };

  // Trigger on button click
  startButton.addEventListener("click", startGame);

  // Trigger if they press 'Enter' inside the input field
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !startButton.disabled) {
      startGame();
    }
  });
});