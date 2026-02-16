const fs = require('fs');
const path = require('path');

// Ensure all required directories exist
const dirs = [
  'public',
  'public/bundle'
];

dirs.forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Ensured directory exists: ${dir}`);
});

console.log('All directories created successfully');