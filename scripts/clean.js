const fs = require('fs');
const path = require('path');

function removeRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Removed: ${dirPath}`);
  }
}

// Clean build output directories
removeRecursive('public');
removeRecursive('dist');
removeRecursive('native');

console.log('Clean completed successfully');