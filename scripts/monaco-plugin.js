/**
 * ESBuild plugin for Monaco Editor
 * 
 * This plugin handles bundling Monaco Editor with proper worker configuration
 */
const fs = require('fs');
const path = require('path');

module.exports = {
  monacoPlugin: {
    name: 'monaco-editor',
    setup(build) {
      // Copy Monaco editor files to public directory
      build.onStart(() => {
        const monacoPath = path.join(__dirname, '../node_modules/monaco-editor/min');
        const targetPath = path.join(__dirname, '../public/monaco-editor');

        // Ensure target directory exists
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }

        // Copy vs directory (contains workers and other assets)
        const vsSource = path.join(monacoPath, 'vs');
        const vsTarget = path.join(targetPath, 'vs');
        
        copyDirectorySync(vsSource, vsTarget);
        
        // No need to copy worker files separately - they'll be loaded via AMD from the vs directory
        
        console.log('Monaco Editor assets and workers copied to public/monaco-editor');
      });

      // Handle monaco-editor imports - use the full main entry
      build.onResolve({ filter: /^monaco-editor$/ }, (args) => {
        return {
          path: require.resolve('monaco-editor/esm/vs/editor/editor.main.js'),
          external: false,
        };
      });
    },
  },
};

function copyDirectorySync(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read all items in source directory
  const items = fs.readdirSync(src);

  items.forEach(item => {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy subdirectories
      copyDirectorySync(srcPath, destPath);
    } else {
      // Copy file
      fs.copyFileSync(srcPath, destPath);
    }
  });
}