const fs = require('fs');
const path = './database/users.json';

// Funcție utilitară pentru a citi în siguranță fișierul JSON
function loadData() {
  try {
    if (!fs.existsSync(path)) {
      return {}; // Returnează un obiect gol dacă fișierul nu există
    }
    const fileContent = fs.readFileSync(path, 'utf-8');
    return fileContent ? JSON.parse(fileContent) : {}; // Previne crash-ul dacă fișierul e gol
  } catch (error) {
    console.error("Error at reading the command.:", error);
    return {};
  }
}

module.exports = {
  addXP(userId, amount) {
    let data = loadData();

    // Dacă utilizatorul nu există, îl creăm
    if (!data[userId]) {
      data[userId] = { xp: 0, level: 1 };
    }

    data[userId].xp += amount;
    let leveledUp = false;

    // Folosim 'while' în caz că primește mult XP și crește mai multe niveluri simultan
    while (data[userId].xp >= data[userId].level * 100) {
      const neededXP = data[userId].level * 100;
      data[userId].xp -= neededXP; // Scădem doar cât a avut nevoie, păstrăm restul
      data[userId].level++;
      leveledUp = true;
    }

    // SALVAREA are loc acum în ambele cazuri (și dacă face level up, și dacă nu)
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
    
    return leveledUp; // Returnează true sau false
  },

  getUser(userId) {
    let data = loadData();
    return data[userId] || { xp: 0, level: 1 };
  }
};