import { Game } from './game.js';

// --- 1. NETWORKING SETUP ---
const SERVER_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

const game = new Game(SERVER_URL);

// --- 2. COLOR PICKER UTILITY FUNCTIONS ---
function hueToHexStr(h: number): string {
  const f = (n: number, k = (n + h / 60) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
  const r = Math.round(255 * f(5));
  const g = Math.round(255 * f(3));
  const b = Math.round(255 * f(1));

  const toHex = (c: number) => c.toString(16).padStart(2, '0').toUpperCase();
  return `0x${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexStrToHue(hex: string): number {
  const cleanHex = hex.replace('0x', '').replace('0X', '').replace('#', '');
  if (cleanHex.length !== 6) return 0;

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;

  const d = max - min;
  let h = 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  return Math.round(h * 60);
}

// Validate if input matches exactly 0x followed by 6 hex characters
function isValidHex(hex: string): boolean {
  return /^0X[0-9A-F]{6}$/.test(hex.toUpperCase());
}

// Setup the Welcome UI Logic
document.addEventListener("DOMContentLoaded", () => {
  const welcomeScreen = document.getElementById("welcome-screen") as HTMLDivElement;
  const nameInput = document.getElementById("player-name") as HTMLInputElement;
  const startButton = document.getElementById("start-btn") as HTMLButtonElement;

  // Custom UI elements
  const rainbowSlider = document.getElementById('rainbow-slider') as HTMLInputElement;
  const hexInput = document.getElementById('color-hex-input') as HTMLInputElement;
  const colorPreview = document.getElementById('color-preview') as HTMLDivElement;

  // Error messaging nodes
  const nameError = document.getElementById('name-error') as HTMLDivElement;
  const hexError = document.getElementById('hex-error') as HTMLDivElement;

  // Global form validator rule
  const validateForm = () => {
    const isNameValid = nameInput.value.trim().length > 0;
    const isHexValid = isValidHex(hexInput.value);

    // Toggle error messages dynamically
    nameError.style.display = isNameValid || nameInput.value === "" ? "none" : "block";
    hexError.style.display = isHexValid || hexInput.value === "" ? "none" : "block";

    // Disable button if either check fails
    startButton.disabled = !isNameValid || !isHexValid;
  };

  // --- COLOR PICKER INTERACTION ---

  // 1. Sliding updates input and color block
  rainbowSlider.addEventListener('input', () => {
    const hexStr = hueToHexStr(parseInt(rainbowSlider.value));
    colorPreview.style.backgroundColor = hexStr.replace('0x', '#');
    hexInput.value = hexStr;
    validateForm();
  });

  // 2. Typing directly handles bidirectional updates smoothly
  hexInput.addEventListener('input', () => {
    let val = hexInput.value.toUpperCase();

    // Automatically force prefix corrections while typing
    if (!val.startsWith('0X')) {
      val = '0X' + val.replace(/[^0-9A-F]/g, '');
    }

    hexInput.value = val;

    // Bidirectional update triggers immediately whenever layout reads clean data
    if (isValidHex(val)) {
      const calculatedHue = hexStrToHue(val);
      rainbowSlider.value = calculatedHue.toString();
      colorPreview.style.backgroundColor = val.replace('0X', '#');
    }

    validateForm();
  });

  // --- REGULAR FIELD VALIDATIONS ---
  nameInput.addEventListener("input", validateForm);

  // --- GAME LAUNCH ACTION ---
  const startGame = () => {
    const finalName = nameInput.value.trim();
    if (!finalName || !isValidHex(hexInput.value)) return;

    const finalColorNum = parseInt(hexInput.value, 16);

    // Save states
    sessionStorage.setItem("username", finalName);
    sessionStorage.setItem("playerColor", finalColorNum.toString());

    welcomeScreen.style.opacity = "0";
    setTimeout(() => {
      welcomeScreen.style.display = "none";
      game.initGame();
    }, 500);
  };

  startButton.addEventListener("click", startGame);

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !startButton.disabled) {
      startGame();
    }
  });

  // Initialize current valid state defaults
  validateForm();
  colorPreview.style.backgroundColor = hexInput.value.replace('0X', '#').replace('0x', '#');
});