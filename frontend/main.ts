import { Game } from './game.js';

const SERVER_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

const game = new Game(SERVER_URL);

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

function isValidHex(hex: string): boolean {
  return /^0X[0-9A-F]{6}$/.test(hex.toUpperCase());
}

document.addEventListener("DOMContentLoaded", () => {
  const welcomeScreen = document.getElementById("welcome-screen") as HTMLDivElement;
  const nameInput = document.getElementById("player-name") as HTMLInputElement;
  const startButton = document.getElementById("start-btn") as HTMLButtonElement;

  const rainbowSlider = document.getElementById('rainbow-slider') as HTMLInputElement;
  const hexInput = document.getElementById('color-hex-input') as HTMLInputElement;
  const colorPreview = document.getElementById('color-preview') as HTMLDivElement;

  const nameError = document.getElementById('name-error') as HTMLDivElement;
  const hexError = document.getElementById('hex-error') as HTMLDivElement;

  // Track active weapon key
  let chosenWeapon = 'sword';

  // Weapon buttons selection switching logic
  const weaponButtons = document.querySelectorAll('.weapon-btn');
  weaponButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      weaponButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      chosenWeapon = (btn as HTMLButtonElement).dataset.weapon || 'sword';
    });
  });

  const validateForm = () => {
    const isNameValid = nameInput.value.trim().length > 0;
    const isHexValid = isValidHex(hexInput.value);

    nameError.style.display = isNameValid || nameInput.value === "" ? "none" : "block";
    hexError.style.display = isHexValid || hexInput.value === "" ? "none" : "block";

    startButton.disabled = !isNameValid || !isHexValid;
  };

  rainbowSlider.addEventListener('input', () => {
    const hexStr = hueToHexStr(parseInt(rainbowSlider.value));
    colorPreview.style.backgroundColor = hexStr.replace('0x', '#');
    hexInput.value = hexStr;
    validateForm();
  });

  hexInput.addEventListener('input', () => {
    let val = hexInput.value.toUpperCase();
    if (!val.startsWith('0X')) {
      val = '0X' + val.replace(/[^0-9A-F]/g, '');
    }
    hexInput.value = val;

    if (isValidHex(val)) {
      const calculatedHue = hexStrToHue(val);
      rainbowSlider.value = calculatedHue.toString();
      colorPreview.style.backgroundColor = val.replace('0X', '#');
    }
    validateForm();
  });

  nameInput.addEventListener("input", validateForm);

  const startGame = () => {
    const finalName = nameInput.value.trim();
    if (!finalName || !isValidHex(hexInput.value)) return;

    const finalColorNum = parseInt(hexInput.value, 16);

    // Resolve 'random' options instantly during setup
    let weaponPool = ['sword', 'lance', 'bow', 'firestaff'];
    if (chosenWeapon === 'random') {
      chosenWeapon = weaponPool[Math.floor(Math.random() * weaponPool.length)];
    }

    // Save states globally for lookup in Game class setup routines
    sessionStorage.setItem("username", finalName);
    sessionStorage.setItem("playerColor", finalColorNum.toString());
    sessionStorage.setItem("selectedWeapon", chosenWeapon);

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

  validateForm();
  colorPreview.style.backgroundColor = hexInput.value.replace('0X', '#').replace('0x', '#');
});