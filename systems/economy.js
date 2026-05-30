const fs = require('fs');
const path = './database/users.json';

// Helper function to safely read the JSON file
function loadData() {
  try {
    if (!fs.existsSync(path)) {
      return {}; // Returns an empty object if the file doesn't exist yet
    }
    const fileContent = fs.readFileSync(path, 'utf-8');
    return fileContent ? JSON.parse(fileContent) : {}; // Prevents crashes if the file is completely empty
  } catch (error) {
    console.error("Error reading the economy database:", error);
    return {};
  }
}

// Helper function to safely write data to the JSON file
function saveData(data) {
  try {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving to the economy database:", error);
  }
}

module.exports = {
  addMoney(userId, amount) {
    let data = loadData();

    // If the user doesn't exist in the database, initialize them
    if (!data[userId]) {
      data[userId] = { money: 0 };
    }

    data[userId].money += amount;

    // Optional: Prevent negative balance if you subtract money using negative numbers (e.g., amount = -50)
    if (data[userId].money < 0) {
      data[userId].money = 0;
    }

    saveData(data);
    return data[userId].money; // Optional: returns the new balance, useful for "You now have X coins" messages
  },

  getMoney(userId) {
    let data = loadData();
    return data[userId]?.money ?? 0; // Using ?? (nullish coalescing) ensures it returns 0 if the user or money property is missing
  }
};