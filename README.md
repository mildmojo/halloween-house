# This house shall be haunted!

Or something.

This ties together my Teensy-powered HC4 ultrasonic rangefinder and a set of
Mi.light RGBW wireless LED bulbs with two scenes.

- Scene 1: Sconces beside the door white, like normal house lights.
- Scene 2: Sconces orange, effect lamps hidden in flowerpots purple.

Waits 5s after rangefinder connection or app start to take a minimum distance
calibration reading. Then, when min distance is breached, triggers scene 2 until
about 20s after object moves out of min distance, resetting to scene 1.

Ugly code. Spent about 2.5 hours on it.

## Lights config

Link doorside sconce lights to group 1, flowerpot lights to group 2. Server is
hard-coded to treat group 1 as RGBW (no saturation control) and group 2 as RGBWW
(with saturation control). Make sure you have the saturation-enabled remote
selected in the Mi.light app when linking saturation-enabled bulbs, or they
won't respond to saturation commands.

I used these:

- 2x [6W RGBW](https://www.amazon.com/Mi-Light-Changing-Dimmable-Smartphone-Equivalent/dp/B06XHKS798/)
- 2x [9W RGBWW](https://www.amazon.com/Mi-light-Dimmable-Changing-Spotlight-Controlled/dp/B01LPRQ4BK/)
- 1x [Wifi box v6](https://www.amazon.com/Controller-iBox2-Wireless-Downlight-Compatible/dp/B01N7C3HXQ/)

(All equipment also available for less money from [LimitlessLED](http://limitlessled.com),
whose shipping from NZ to the U.S. took about a week and cost $17 for 2 bulbs
and a wifi box.)

## Software config

- Run `yarn` to install dependencies.
- Edit `config.json` and set your serial port name. (Run `yarn list` for a list
  of ports on your system.)
- Optionally override other config settings there.
- Start the server with `yarn start`
- If you haven't specified the minimum distance, stand in front of the sensor
  at the desired distance for five (5) seconds after start to take a reading.
  You may disconnect and reconnect the USB rangefinder to restart the 5s
  calibration routine.
