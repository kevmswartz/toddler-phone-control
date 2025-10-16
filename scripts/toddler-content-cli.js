#!/usr/bin/env node

/**
 * Simple CLI helper for managing toddler-content.json.
 *
 * Usage examples:
 *   npm run content -- init
 *   npm run content -- list
 *   npm run content -- add-special --id krave --label "Krave" --emoji 😀 --handler speakTts --args "I want Krave" --zone quick
 *   npm run content -- add-quick --id babyShark --label "Baby Shark" --type youtube --videoId OBqZDyVlFP8
 *   npm run content -- remove --id babyShark
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.resolve(process.cwd(), 'toddler-content.json');

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args.shift();
  const options = {};
  let currentKey = null;

  for (const token of args) {
    if (token.startsWith('--')) {
      currentKey = token.slice(2);
      if (!options[currentKey]) {
        options[currentKey] = [];
      }
    } else if (currentKey) {
      options[currentKey].push(token);
    } else {
      throw new Error(`Unexpected argument "${token}".`);
    }
  }

  Object.keys(options).forEach((key) => {
    if (options[key].length === 0) {
      options[key] = true;
    } else if (options[key].length === 1) {
      options[key] = options[key][0];
    }
  });

  return { command, options };
}

function loadContent(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      specialButtons: [],
      quickLaunch: [],
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.specialButtons || !Array.isArray(parsed.specialButtons)) {
      parsed.specialButtons = [];
    }
    if (!parsed.quickLaunch || !Array.isArray(parsed.quickLaunch)) {
      parsed.quickLaunch = [];
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${error.message}`);
  }
}

function saveContent(filePath, data) {
  const output = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, output + '\n', 'utf8');
  console.log(`Saved ${filePath}`);
}

function listContent(filePath, data) {
  console.log(`File: ${filePath}`);
  console.log(`Special Buttons (${data.specialButtons.length})`);
  data.specialButtons.forEach((item) => {
    console.log(`  • ${item.id}  [${item.zone || 'quick'}] ${item.label}`);
  });
  const quickLaunchCount = data.quickLaunch.length;
  const quickSpecial = data.specialButtons.filter((item) => (item.zone || 'quick') === 'quick');
  console.log(`\nQuick Launch (${quickLaunchCount})`);
  data.quickLaunch.forEach((item) => {
    console.log(`  • ${item.id}  (${item.type || 'unknown'}) ${item.label}`);
  });
  if (quickSpecial.length) {
    console.log(`\nQuick Specials (${quickSpecial.length})`);
    quickSpecial.forEach((item) => {
      console.log(`  • ${item.id}  [special] ${item.label}`);
    });
  }
}

function ensureIdAvailable(data, id) {
  const exists =
    data.specialButtons.some((item) => item.id === id) ||
    data.quickLaunch.some((item) => item.id === id);
  if (exists) {
    throw new Error(`ID "${id}" already exists in toddler-content.json`);
  }
}

function addSpecial(data, options) {
  const required = ['id', 'label', 'emoji', 'handler'];
  required.forEach((key) => {
    if (!options[key]) {
      throw new Error(`Missing required option --${key}`);
    }
  });

  ensureIdAvailable(data, options.id);

  const entry = {
    id: options.id,
    emoji: options.emoji,
    label: options.label,
    handler: options.handler,
    category: options.category || 'kidMode-remote',
    zone: options.zone || 'quick',
  };

  if (options.thumbnail) {
    entry.thumbnail = options.thumbnail;
  }

  if (options.favoriteLabelId) {
    entry.favoriteLabelId = options.favoriteLabelId;
  }

  if (options.appId) {
    entry.appId = options.appId;
  }
  if (options.appName) {
    entry.appName = options.appName;
  }

  if (options.args) {
    entry.args = Array.isArray(options.args) ? options.args : String(options.args).split(',').map((value) => value.trim());
  }

  data.specialButtons.push(entry);
  console.log(`Added special button "${entry.id}"`);
}

function addQuick(data, options) {
  const required = ['id', 'label'];
  required.forEach((key) => {
    if (!options[key]) {
      throw new Error(`Missing required option --${key}`);
    }
  });

  ensureIdAvailable(data, options.id);

  const type = options.type || (options.videoId ? 'youtube' : options.appId ? 'rokuApp' : 'custom');

  const entry = {
    id: options.id,
    label: options.label,
    type,
  };

  if (options.thumbnail) {
    entry.thumbnail = options.thumbnail;
  }

  if (type === 'youtube') {
    if (!options.videoId) {
      throw new Error('You must provide --videoId for type "youtube"');
    }
    entry.videoId = options.videoId;
  } else if (type === 'rokuApp') {
    if (!options.appId) {
      throw new Error('You must provide --appId for type "rokuApp"');
    }
    entry.appId = options.appId;
    if (options.contentId) {
      entry.contentId = options.contentId;
    }
  } else {
    if (options.payload) {
      entry.payload = options.payload;
    }
  }

  data.quickLaunch.push(entry);
  console.log(`Added quick launch entry "${entry.id}"`);
}

function removeEntry(data, id) {
  const beforeSpecial = data.specialButtons.length;
  data.specialButtons = data.specialButtons.filter((item) => item.id !== id);
  const afterSpecial = data.specialButtons.length;

  const beforeQuick = data.quickLaunch.length;
  data.quickLaunch = data.quickLaunch.filter((item) => item.id !== id);
  const afterQuick = data.quickLaunch.length;

  if (beforeSpecial === afterSpecial && beforeQuick === afterQuick) {
    throw new Error(`No entry found with id "${id}"`);
  }
  console.log(`Removed "${id}"`);
}

function initFile(filePath, force) {
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`${filePath} already exists. Use --force to overwrite.`);
  }

  const template = {
    specialButtons: [],
    quickLaunch: [],
  };
  saveContent(filePath, template);
}

function main() {
  try {
    const { command, options } = parseArgs(process.argv);

    if (!command || ['-h', '--help'].includes(command)) {
      console.log(`Usage:
  npm run content -- init [--file path] [--force]
  npm run content -- list [--file path]
  npm run content -- add-special --id ID --label LABEL --emoji 😀 --handler HANDLER [--args "value1,value2"] [--zone quick|remote]
  npm run content -- add-quick --id ID --label LABEL [--type youtube|rokuApp|custom] [--videoId ID] [--appId ID] [--thumbnail URL]
  npm run content -- remove --id ID [--file path]
`);
      return;
    }

    const filePath = path.resolve(process.cwd(), options.file || DEFAULT_FILE);

    if (command === 'init') {
      initFile(filePath, options.force);
      return;
    }

    const data = loadContent(filePath);

    switch (command) {
      case 'list':
        listContent(filePath, data);
        break;
      case 'add-special':
        addSpecial(data, options);
        saveContent(filePath, data);
        break;
      case 'add-quick':
        addQuick(data, options);
        saveContent(filePath, data);
        break;
      case 'remove':
        if (!options.id) {
          throw new Error('Missing required option --id');
        }
        removeEntry(data, options.id);
        saveContent(filePath, data);
        break;
      default:
        throw new Error(`Unknown command "${command}"`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
