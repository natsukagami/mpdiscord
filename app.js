const {
  Client
} = require('discord-rpc');
const mpd = require('mpd');
const log = require("fancy-log");
const events = require('events');
const keys = require('./keys.json');

const rpc = new Client({
    transport: keys.rpcTransportType
  }),
  appClient = keys.appClientID;

var songEmitter = new events.EventEmitter(),
  currentSong = {};

const client = mpd.connect(keys.mpd);

const exit = (err) => {
  if (err)
    log(err);
  log("Connection to mpd ended. Exiting...");
  process.exit(0);
}

function ObjectFromArray(entries) {
  const obj = {};
  for (let item of entries) {
    obj[item[0]] = item[1];
  }
  return obj;
}

/**
 * Parses mpd output into an object
 * @param {string} str 
 */
function parseOutput(str) {
  return ObjectFromArray(str.split('\n').map(s => {
    const firstMark = s.search(':');
    if (firstMark === -1) return undefined;
    return [s.slice(0, firstMark), s.slice(firstMark + 2)];
  }).filter(s => s !== undefined));
}

// Kill the client if there's no mpd / mpd disconnected
client.on('end', exit);

function checkMPD() {
  client.sendCommand(mpd.cmd('status', []), (err, out) => {
    if (err) exit();
    const status = parseOutput(out);
    if (status.state === 'stop') {
      songEmitter.emit('stop');
    } else {
      client.sendCommand(mpd.cmd('currentsong', []), (err, oSong) => {
        const song = parseOutput(oSong);
        // console.log(song);
        // console.log(status);
        songEmitter.emit('song', {
          title: song.Title,
          artist: song.Artist,
          album: song.Album,
          track: song.Track || 1,
          length: Number(song.duration),
          current: Number(status.elapsed),
          date: song.Date.split(' '),
          playing: status.state === 'play'
        });
      });
    }
  });
}

/**
 * Initialise song listeners
 * newSong: gets emitted when the song changes to update the RP
 * songUpdate: currently gets executed when the song gets paused/resumes playing.
 **/
songEmitter.on('song', song => {
  const ImageKey = song.playing ? 'play' : 'pause';
  const start = song.playing ? (new Date().getTime() / 1000) - song.current : undefined;
  const end = song.playing ? start + song.length : undefined;

  rpc.setActivity({
    details: `🎵  ${song.title}`,
    state: `👤  ${song.artist}`,
    startTimestamp: start,
    endTimestamp: end,
    largeImageKey: ImageKey + '_large',
    smallImageKey: ImageKey + '_small',
    largeImageText: `💿 Track #${song.track} from ${song.album}`,
    smallImageText: `💿  ${song.album}`,
    instance: false,
  }).catch(log);

  log(`Updated song to: ${song.artist} - ${song.title} (song playing = ${song.playing ? 'yes' : 'no'})`);
});

songEmitter.on('stop', () => {
  rpc.setActivity({
    details: `🎵  Nothing is playing`,
    state: `mpd stopped`,
    largeImageKey: 'stop_large',
    smallImageKey: 'stop_small',
    instance: false,
  });
  log(`mpd stopped`);
});

rpc.on('ready', () => {
  log(`Connected to Discord! (${appClient})`);
  // Run initially
  checkMPD();

  client.on('system-player', checkMPD);
});

rpc.login(appClient).catch(log.error);