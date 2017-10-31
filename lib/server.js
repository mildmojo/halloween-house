'use strict';

const EventEmitter = require('events').EventEmitter;
const lled = require('lled');
const SerialPort = require('serialport');
const convert = require('color-convert');
const chalk = require('chalk');
// const OneEuroFilter = require('./1euro.js');

module.exports = {start, stop};

// const FILTER = OneEuroFilter(120, 1, 1, 1);

let MIN_TRIGGER_DISTANCE = 0;
let RESET_TIME = 20 * 1000;
const MAX_READING_COUNT = 10;
const CALIBRATE_TIME = 5000;

const DOOR_GROUP = 1;
const PORCH_GROUP = 2;
const COMMANDS_FOR_GROUP = {
  1: lled.Commands.RGBW,
  2: lled.Commands.RGBCCT
};
const LIGHT_DELAY = 100;
const STATE = {
  NORMAL: 0,
  CREEPY: 1
};
const ORANGE = [235, 200, 0];
const PURPLE = [190, 0, 255];
const WHITE = [200, 200, 200];
let lightState = STATE.NORMAL;
let serialPort;
let dataQueue = [];
let departedAt = 0;
let readings = [];
let bridge = null;
let isConnecting = false;
let calibrationStartedAt = Date.now() + 1000000000;

async function start(config) {
  const BRIDGE_IP = config.get('bridge-ip') || config.get('bridgeIP');
  const BRIDGE_MAC = (config.get('bridge-mac') || config.get('bridgeMAC') || '').replace(/[^0-9A-F]/g, '');
  const portName = config.get('serial-port') || config.get('serialPort');
  RESET_TIME = Number(config.get('reset-time-ms') || config.get('resetTimeMs') || RESET_TIME);
  MIN_TRIGGER_DISTANCE = Number(config.get('min-distance') || config.get('minDistance') || 0);
  await openSerialPort(portName, config.get('testmode'));

  await discover(BRIDGE_IP, BRIDGE_MAC);
}

function stop() {

}


function openSerialPort(portName, testmode) {
  let serial = null;

  if (testmode) {
    serial = new EventEmitter();
    serial.send = serial.emit;
  } else {
    console.log(chalk.cyan(`Opening serial port ${portName}...`));
    isConnecting = true;
    serial = new SerialPort(portName, { baudRate: 9600 });
    serial.on('data', chunk => serialUpdate(chunk));
  }

  serial.once('disconnect', () => console.log('disconnect'));

  serial.once('error', err => {
    serial.removeListener('data', serialUpdate);
    MIN_TRIGGER_DISTANCE = 0;
    console.warn(`Error with port ${portName}: ${err}`);
    setTimeout(() => openSerialPort(portName, testmode), 5000);
  });

  serial.once('close', () => {
    serial.removeListener('data', serialUpdate);
    MIN_TRIGGER_DISTANCE = 0;
    console.warn(`Serial port ${portName} closed.`);
    setTimeout(() => openSerialPort(portName, testmode), 5000);
  });

  serialPort = serial;

  return new Promise(resolve => {
    serial.once('open', () => {
      isConnecting = false;
      // Don't calibrate if we already have a minimum distance from config.
      console.log(chalk.blue.bold(`Calibrating (${CALIBRATE_TIME/1000}s)...`));
      calibrationStartedAt = MIN_TRIGGER_DISTANCE ? 0 : Date.now();
      resolve();
    });
  });
}

function serialUpdate(data) {
  // Update queue with incoming data.
  dataQueue = dataQueue.concat(data.toString().split(''));

  // Sentinel bytes have a 1 in their LSB, meaning a sequence is complete.
  let seqCount = dataQueue.filter(byte => byte === "\n").length;
  if (seqCount === 0) return;

  // Process each buffered sequence.
  for (let seqNum = 0; seqNum < seqCount; seqNum++) {
    let distance = dataQueue.slice(0, dataQueue.indexOf("\n"));
    dataQueue = dataQueue.slice(distance.length + 1);
    checkDistance(Number(distance.join('')));
  }
}

function checkDistance(dist) {
  readings.push(dist)
  if (readings.length > MAX_READING_COUNT) readings.shift();
  const avgDist = readings.reduce((sum, d) => sum + d, 0) / readings.length;

  // console.log('DIST ' + avgDist);

  if (calibrationStartedAt && Date.now() - calibrationStartedAt > CALIBRATE_TIME) {
    MIN_TRIGGER_DISTANCE = avgDist;
    console.log(chalk.blue.bold(`Calibrated min trigger distance: ${MIN_TRIGGER_DISTANCE}`));
    calibrationStartedAt = 0;
    return;
  } else if (calibrationStartedAt) {
    return;
  }

  if (avgDist < MIN_TRIGGER_DISTANCE && lightState === STATE.NORMAL) {
    console.log(chalk.rgb(200, 50, 255).bold('TRIGGER!'));
    departedAt = Date.now();
    setOn(PORCH_GROUP)
      .then(() => light(...ORANGE, DOOR_GROUP))
      .then(() => light(...PURPLE, PORCH_GROUP));
    lightState = STATE.CREEPY;
  } else if (avgDist > MIN_TRIGGER_DISTANCE && Date.now() - departedAt > RESET_TIME && lightState === STATE.CREEPY) {
    console.log(chalk.rgb(255, 255, 0).bold('DEPARTED!'));
    light(...WHITE, DOOR_GROUP)
      .then(() => setOff(PORCH_GROUP));
    lightState = STATE.NORMAL;
  } else if (avgDist < MIN_TRIGGER_DISTANCE && lightState === STATE.CREEPY) {
    departedAt = Date.now();
  }
}


function discover(bridgeIP, bridgeMAC) {
  // return Promise.resolve();
  return new Promise(resolve => {
    if (bridgeIP) {
      let newBridge = new lled.Bridge(bridgeIP, bridgeMAC);
      afterDiscover(null, [newBridge]);
    } else {
      lled.discover(afterDiscover);
    }

    function afterDiscover(error, bridges) {
      if (error) throw error;

      console.log('Found', bridges.length, 'bridges');

      if (bridges.length == 0) {
        return new Promise(resolve => {
          setTimeout(() => {
            console.log('no bridges found, reconnecting...')
            discover().then(resolve);
          }, 100);
        })
      }

      bridge = bridges[0];
      console.log('Using bridge at', bridge.address, 'with mac', bridge.mac);

      // if you don't listen to the error event errors will be thrown and exit the process
      bridge.on('error', function(error) {
        console.log('Bridge error', error);
        // console.log('error, reconnecting...')
        // discover();
      });

      resolve();
    }
  });
}




function light(r, g, b, group) {
// return;

  if (Array.isArray(r)) {
    group = g;
    b = r[2];
    g = r[1];
    r = r[0];
  }

  const isGrey = r === g && g === b;
  const isBlack = r === g && g === b && r === 0;
  const hsv = convert.rgb.hsv(r, g, b);
  hsv[0] = hsv[0]/360 * 255;
  hsv[0] = isGrey ? 'grey' : hsv[0];
  hsv[1] = 100 - hsv[1];
  hsv[2] = isBlack ? 0 : hsv[2];

  if (hsv[0] === 'black') {
    return setOff().catch(console.warn);
  }

  // setOn().then(() => console.log('turned on'));
  let cmd;
  if (hsv[0] === 'grey') {
    cmd = setWhite(group)
      .then(() => setBrightness(hsv[2], group));
  } else {
    cmd = setBrightness(hsv[2], group)
      .then(() => setHue(hsv[0], group));
  }

  return cmd.then(() => setSaturation(hsv[1], group))
    .catch(console.warn);
}

function setOff(group) {
  const cmd = COMMANDS_FOR_GROUP[group].Off();
  return send(cmd, group);
}

function setOn(group) {
  const cmd = COMMANDS_FOR_GROUP[group].On();
  return send(cmd, group);
}

function setWhite(group) {
  let cmd = null;
  let commands = COMMANDS_FOR_GROUP[group];
  if ('SetKelvin' in commands) {
    cmd = commands.SetKelvin(100);
  } else {
    cmd = commands.WhiteOn();
  }
  return send(cmd, group);
}

function setHue(val, group) {
  const cmd = COMMANDS_FOR_GROUP[group].SetHue(val);
  return send(cmd, group);
}

function setSaturation(val, group) {
  const commands = COMMANDS_FOR_GROUP[group];
  if ('SetSaturation' in commands) {
    const cmd = commands.SetSaturation(val);
    return send(cmd, group);
  } else {
    return Promise.resolve();
  }
}

function setBrightness(val, group) {
  const cmd = COMMANDS_FOR_GROUP[group].SetBrightness(val);
  return send(cmd);
}

function send(cmd, group) {
  if (bridge) {
    return new Promise(resolve => {
      bridge.send(cmd, group, err => {
        if (err) discover();
        setTimeout(resolve, LIGHT_DELAY);
      });
    });
  } else {
    return Promise.resolve();
  }
}
