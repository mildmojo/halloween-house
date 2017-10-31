'use strict';
const fs = require('fs');
const {spawn} = require('child_process');
const SerialPort = require('serialport');
const nconf = require('nconf');
const cjson = require('cjson');
const chalk = require('chalk');
const server = require('./lib/server.js');
const {version} = require('./package.json');

nconf.use('memory').argv().env();
const configFile = nconf.get('CONFIG_FILE') || nconf.get('config_file') || 'config.json';
nconf.defaults(readConfig(configFile));
nconf.set('serialPort', nconf.get('SERIALPORT') || nconf.get('serialPort') || '/dev/ttyS0');
nconf.set('testmode', nconf.get('TESTMODE') || nconf.get('testmode'));
verifyConfig(nconf);

if (nconf.get('version')) showVersionQuit();
if (nconf.get('list')) showPortsQuit();
if (nconf.get('help')) showHelpQuit();

process.on('SIGINT', () => {
  console.log('interrupted');
  process.exit();
});

process.on('SIGTERM', () => {
  console.log('terminated');
  process.exit();
});

(async function() {
  try {
    await server.start(nconf);
  } catch(e) {
    console.error(`Failed to start server: ${e}`);
  }

  console.log(chalk.blue.bold('Press CTRL+C to quit.'));
  spawnChild(nconf.get('wrap-cmd'));
})();

/******************************************************************************/

function showHelpQuit() {
  console.log('Options:');
  console.log('  --help          - Prints this usage info');
  console.log('  --list          - Prints available serial ports');
  console.log('  --port n        - Listen port number for HTTP server (default: 3000)');
  console.log("  --testmode      - Simulate serial port activity, don't open real ports");
  console.log('  --version       - Prints server version number');
  process.exit();
}

function showVersionQuit() {
  console.log(version);
  process.exit();
}

async function showPortsQuit() {
  let portList;

  try {
    portList = await SerialPort.list();
  } catch(e) {
    return console.error(e);
  }

  console.log(chalk.yellow.bold("Paste one or more of these serial ports into 'config.json':"));
  for (let port of portList) {
    let attrs = Object.keys(port)
      .filter(key => key !== 'comName')
      .reduce((sum, key) => port[key] ? sum.concat(`${key}: ${port[key]}`) : sum, []);
    console.log(chalk.yellow(`"${port.comName}", ` + (attrs.length ? `// ${attrs.join(', ')}` : '')));
  }
  process.exit();
}

function readConfig(file) {
  if (!fs.existsSync('./config.json')) {
    console.warn(chalk.red.bold(`Could not find ${file}. Please copy` +
      ` ${file}.example to ${file}) and edit it.`));
    throw new Error(`File not found: ${file}`)
  }

  return cjson.load(file);
}

function verifyConfig(config) {
  const port = config.get('serialPort');
  if (!port) {
    console.warn(`No serial port configured! Please specify serial port in ${configFile}.`);
    throw new Error('Serial port not configured.');
  }
}

// Spawn a child process with a suicide pact; parent & child die together.
function spawnChild(cmd) {
  if (!cmd) return;
  const cwd = nconf.get('wrap-dir');

  console.log(chalk.green(`Spawning subprocess '${cmd}'...`))
  const spawnOpts = {
    stdio: 'inherit',
    shell: true,
    cwd: cwd
  };
  const child = spawn(cmd, [], spawnOpts);

  process.on('SIGINT', onExit);
  process.on('exit', onExit);
  child.on('exit', onChildExit)

  function onChildExit() {
    console.log(chalk.green('Wrapped process exited, server exiting...'));
    process.removeListener('exit', onExit);
  }

  function onExit(code) {
    console.log(chalk.green('Exiting, killing subprocess...'))

    child.removeAllListeners();
    process.removeListener('exit', onExit);

    child.kill.bind(child);
    process.exit(code);
  }
}
